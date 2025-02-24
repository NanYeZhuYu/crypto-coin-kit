import {ec} from 'elliptic';
// @ts-ignore
import secp256k1 from 'secp256k1';
import {Result} from '../Common/sign';

export const SignProviderWithPrivateKey = (privateKey: string) => {
  return {
    sign: async (hex: string): Promise<Result> => {
      try {
        const input = Buffer.from(hex, 'hex');
        const privKey = Buffer.from(privateKey, 'hex');
        const sigObj = secp256k1.ecdsaSign( new Uint8Array(input), new Uint8Array(privKey));
        const r = Buffer.from(sigObj.signature.slice(0, 32)).toString('hex');
        const s = Buffer.from(sigObj.signature.slice(32, 64)).toString('hex');
        const recId = sigObj.recid || 0;
        return {
          r,
          s,
          recId
        };
      } catch (e) {
        console.log(e);
        throw e;
      }
    },
  };
};

export const SignProviderWithPrivateKeySync = (privateKey: string) => {
  return {
    sign: (hex: string): Result => {
      try {
        const input = Buffer.from(hex, 'hex');
        const privKey = Buffer.from(privateKey, 'hex');
        const sigObj = secp256k1.ecdsaSign( new Uint8Array(input), new Uint8Array(privKey));
        const r = Buffer.from(sigObj.signature.slice(0, 32)).toString('hex');
        const s = Buffer.from(sigObj.signature.slice(32, 64)).toString('hex');
        const recId = sigObj.recid || 0;
        return {
          r,
          s,
          recId
        };
      } catch (e) {
        console.log(e);
        throw e;
      }
    },
  };
};

export const signWithPrivateKey = (privateKey: string) => {
  return {
    sign: async (hex: string): Promise<Result> => {
      try {
        const input = Buffer.from(hex, 'hex');
        const privKey = Buffer.from(privateKey, 'hex');
        const EC = new ec('secp256k1').keyFromPrivate(privKey);

        const signObj = await EC.sign(input);
        const r = signObj.r.toString('hex');
        const s = signObj.s.toString('hex');
        const recId = signObj.recoveryParam || 0;

        return {
          r,
          s,
          recId,
        };
      } catch (e) {
        console.log(e);
        throw e;
      }
    },
  };
};
