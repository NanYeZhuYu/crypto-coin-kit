import * as bitcoin from 'bitcoinjs-lib';
// @ts-ignore
import bs58check from 'bs58check';
import {decode as bech32Decode} from 'bech32';
import {cloneDeep} from 'lodash';
import {BTC, Destination, TxData, TxOutputItem} from '../BTC';
import {bitcoin as bitcoinNetwork, litecoin} from '../BTC_FORK/networks';
import {KeyProvider, KeyProviderSync} from '../Common/sign';

export class LTC extends BTC {
  constructor() {
    super();
    this.network = litecoin;
  }

  public async generateTransaction(txData: TxData, signers: KeyProvider[]) {
    return super.generateTransaction(this.processTxData(txData), signers);
  }

  public generateTransactionSync(txData: TxData, signers: KeyProviderSync[]) {
    return super.generateTransactionSync(this.processTxData(txData), signers);
  }

  public isAddressValid(address: string): boolean {
    if (
      address.startsWith('L') ||
      address.startsWith('3') ||
      address.startsWith('M')
    ) {
      try {
        bs58check.decode(address);
        return true;
      } catch (e) {
        return false;
      }
    } else if (address.startsWith('ltc')) {
      try {
        bech32Decode(address);
        return true;
      } catch (e) {
        return false;
      }
    } else {
      return false;
    }
  }

  public convertAddress(address: string): string {
    const {version, hash} = bitcoin.address.fromBase58Check(address);
    switch (version) {
      case bitcoinNetwork.scriptHash:
        return bitcoin.address.toBase58Check(hash, litecoin.scriptHash);
      case bitcoinNetwork.pubKeyHash:
        return bitcoin.address.toBase58Check(hash, litecoin.pubKeyHash);
      case litecoin.scriptHash:
        return bitcoin.address.toBase58Check(hash, bitcoinNetwork.scriptHash);
      case litecoin.pubKeyHash:
        return bitcoin.address.toBase58Check(hash, bitcoinNetwork.pubKeyHash);
      default:
        return address;
    }
  }

  private isDestinationOutputs = (
    out: TxOutputItem[] | Destination,
  ): out is Destination => {
    const output = out as Destination;
    return (
      output.to !== undefined &&
      output.amount !== undefined &&
      output.fee !== undefined &&
      output.changeAddress !== undefined
    );
  };

  private convertLegacyAddress(legacyAddress: string): string {
    if (this.isAddressValid(legacyAddress) && legacyAddress.startsWith('3')) {
      return this.convertAddress(legacyAddress);
    }
    return legacyAddress;
  }

  private processTxData = (txData: TxData): TxData => {
    const processedTxData = cloneDeep(txData);
    if (this.isDestinationOutputs(processedTxData.outputs)) {
      processedTxData.outputs.to = this.convertLegacyAddress(
        processedTxData.outputs.to,
      );
      processedTxData.outputs.changeAddress = this.convertLegacyAddress(
        processedTxData.outputs.changeAddress,
      );
    } else {
      processedTxData.outputs.forEach(
        out => (out.address = this.convertLegacyAddress(out.address)),
      );
    }
    return processedTxData;
  };
}
