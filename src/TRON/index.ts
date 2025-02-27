// @ts-ignore
import {Transaction} from '@tronscan/client/src/protocol/core/Tron_pb';
import {
  buildFreezeBalance,
  buildTransferTransaction,
  buildTriggerSmartContract,
  buildUnfreezeBalance,
  buildVote,
  buildWithdrawBalance,
  // @ts-ignore
} from '@tronscan/client/src/utils/transactionBuilder';
import assert from 'assert';
// @ts-ignore
import bs58check from 'bs58check';

import sha3 from 'js-sha3';
// @ts-ignore
import secp256k1 from 'secp256k1';
import {SignProvider, SignProviderSync} from '../Common';
import {Coin} from '../Common/coin';

import * as bitcoin from 'bitcoinjs-lib';
import {Result} from '../Common/sign';
import {numberToHex} from '../utils';
import {sha256} from '../utils/hash256';

import * as Ethers from 'ethers';

export enum ResourceType {
  'NET' = 'BANDWIDTH',
  'ENERGY' = 'ENERGY',
}

interface LatestBlock {
  hash: string;
  number: number;
  timestamp: number;
}

interface Override {
  tokenShortName?: string;
  tokenFullName: string;
  decimals: 0;
}

export interface TxData {
  token?: string; // required for TRC10 token, for example '1001090' for TRONONE
  contractAddress?: string; // required for TRC20 token
  from: string;
  to: string;
  memo?: string;
  value: string;
  latestBlock: LatestBlock;
  override?: Override;
  fee: number;
}

export interface VoteData {
  address: string;
  votes: {[key: string]: number};
  latestBlock: LatestBlock;
}

export class TRON implements Coin {
  public generateAddress = (publicKey: string) => {
    let pubBytes = new Uint8Array(Buffer.from(publicKey, 'hex'));
    pubBytes = Buffer.from(secp256k1.publicKeyConvert(pubBytes, false)).slice(1);
    const hash = sha3.keccak_256(pubBytes).toString();
    const addressHex = hash.substring(24);
    return bitcoin.address.toBase58Check(Buffer.from(addressHex, 'hex'), 0x41);
  };

  public isAddressValid = (address: string) => {
    if (address.startsWith('T')) {
      try {
        bs58check.decode(address);
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  };

  public convertAddress = (address: string) => {
    return bs58check.decode(address).toString('hex');
  };

  public generateTransaction = async (
    txData: TxData,
    signProvider: SignProvider,
  ) => {
    let tx: Transaction;
    if (txData.contractAddress) {
      tx = this.generateTRC20Transaction(txData);
    } else {
      tx = this.buildTransferTx(txData);
    }
    return this.signTxRawData(tx, signProvider);
  };

  public generateTransactionSync = (
    txData: TxData,
    signProvider: SignProviderSync,
  ) => {
    let tx: Transaction;
    if (txData.contractAddress) {
      tx = this.generateTRC20Transaction(txData);
    } else {
      tx = this.buildTransferTx(txData);
    }
    const raw = tx.getRawData();
    const rawBytes = raw.serializeBinary();
    const hash = sha256(rawBytes);
    const sig = signProvider.sign(hash.toString('hex'));
    return this.buildSignTxResult(sig, tx);
  };

  public signMessage = async (message: string, signProvider: SignProvider) => {
    const hash = sha256(Buffer.from(message, 'utf-8'));
    const sig = await signProvider.sign(hash.toString('hex'));
    return sig.r.concat(sig.s).concat(numberToHex(sig.recId));
  };

  public signMessageSync = (
    message: string,
    signProvider: SignProviderSync,
  ) => {
    const hash = sha256(Buffer.from(message, 'utf-8'));
    const sig = signProvider.sign(hash.toString('hex'));
    return sig.r.concat(sig.s).concat(numberToHex(sig.recId));
  };

  public vote = async (voteData: VoteData, signProvider: SignProvider) => {
    const {address, votes, latestBlock} = voteData;
    const tx = this.refWithLatestBlock(buildVote(address, votes), latestBlock);
    return this.signTxRawData(tx, signProvider);
  };

  public withdrawReward = async (
    {address, latestBlock}: {address: string; latestBlock: LatestBlock},
    signProvider: SignProvider,
  ) => {
    const tx = this.refWithLatestBlock(
      buildWithdrawBalance(address),
      latestBlock,
    );
    return this.signTxRawData(tx, signProvider);
  };

  public freezeBalance = async (
    {
      address,
      amount,
      duration = 3,
      latestBlock,
      resourceType,
    }: {
      address: string;
      amount: number;
      duration?: number;
      latestBlock: LatestBlock;
      resourceType: ResourceType;
    },
    signProvider: SignProvider,
  ) => {
    const tx = this.refWithLatestBlock(
      buildFreezeBalance(address, amount, duration, resourceType),
      latestBlock,
    );
    return this.signTxRawData(tx, signProvider);
  };

  public unFreezeBalance = async (
    {
      address,
      latestBlock,
      resourceType,
    }: {
      address: string;
      latestBlock: LatestBlock;
      resourceType: ResourceType;
    },
    signProvider: SignProvider,
  ) => {
    const tx = this.refWithLatestBlock(
      buildUnfreezeBalance(address, resourceType),
      latestBlock,
    );
    return this.signTxRawData(tx, signProvider);
  };

  private buildTransferTx = (txData: TxData) => {
    const transaction = buildTransferTransaction(
      txData.token || 'TRX',
      txData.from,
      txData.to,
      txData.value,
    );
    return this.refWithLatestBlock(transaction, txData.latestBlock);
  };

  private refWithLatestBlock = (
    tx: Transaction,
    latestBlock: LatestBlock,
    isTRC20 = false,
  ) => {
    // tslint:disable-next-line:variable-name
    const {hash, number, timestamp} = latestBlock;

    const numberBuffer = this.longToByteArray(number);
    numberBuffer.reverse();
    assert.equal(numberBuffer.length, 8);
    const hashBuffer = Buffer.from(hash, 'hex');
    const generateBlockId = [
      ...numberBuffer.slice(0, 8),
      ...hashBuffer.slice(8, hashBuffer.length - 1),
    ];

    const rawData = tx.getRawData();
    rawData.setRefBlockHash(Uint8Array.from(generateBlockId.slice(8, 16)));
    rawData.setRefBlockBytes(Uint8Array.from(numberBuffer.slice(6, 8)));
    if (isTRC20) {
      rawData.setFeeLimit(1000000000);
      rawData.setTimestamp(latestBlock.timestamp);
    }
    rawData.setExpiration(Number(timestamp) + 600 * 5 * 1000);
    tx.setRawData(rawData);
    return tx;
  };

  private longToByteArray = (long: number) => {
    const byteArray = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let index = 0; index < byteArray.length; index++) {
      const byte = long & 0xff;
      byteArray[index] = byte;
      long = (long - byte) / 256;
    }
    return byteArray;
  };

  private buildSignTxResult = (sig: Result, tx: Transaction) => {
    const sigStr = sig.r.concat(sig.s).concat(numberToHex(sig.recId));
    const unit8Array = Uint8Array.from(Buffer.from(sigStr, 'hex'));
    const count = tx.getRawData().getContractList().length;
    for (let i = 0; i < count; ++i) {
      tx.addSignature(unit8Array);
    }
    const hex = Buffer.from(tx.serializeBinary());
    return {
      txHex: hex.toString('hex'),
      txId: sha256(tx.getRawData().serializeBinary()).toString('hex'),
    };
  };

  private generateTRC20Transaction = (txData: TxData) => {
    const ownerAddress = bs58check.decode(txData.from).toString('hex');
    const contractAddress = bs58check
      //@ts-ignore
      .decode(txData.contractAddress)
      .toString('hex');
    const data = this.composeTRC20Data(txData.to, txData.value);
    const tx = buildTriggerSmartContract(
      ownerAddress,
      contractAddress,
      0,
      data,
    );
    return this.refWithLatestBlock(tx, txData.latestBlock, true);
  };

  private composeTRC20Data = (to: string, value = '0') => {
    const functionSelector = 'transfer(address,uint256)';
    const types = ['address', 'uint256'];
    const toAddress = bs58check
      .decode(to)
      .toString('hex')
      .replace(/^(41)/, '0x');
    const values = [toAddress, value.toString()];
    const abiCoder = new Ethers.utils.AbiCoder();
    const parameters = abiCoder.encode(types, values).replace(/^(0x)/, '');
    const selectorStr = sha3
      .keccak_256(Buffer.from(functionSelector))
      .slice(0, 8);
    return selectorStr + parameters;
  };

  private signTxRawData = async (
    tx: Transaction,
    signProvider: SignProvider,
  ) => {
    const raw = tx.getRawData();
    const rawBytes = raw.serializeBinary();
    const hash = sha256(rawBytes);
    const sig = await signProvider.sign(hash.toString('hex'));
    return this.buildSignTxResult(sig, tx);
  };
}
