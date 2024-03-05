# sorobill

## Without a TX
```ts
import { Account, Keypair, Networks, Operation, SorobanRpc, TransactionBuilder, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { sorobill } from "sorobill";

const rpcUrl = 'http://localhost:8000/soroban/rpc'
const rpc = new SorobanRpc.Server(rpcUrl, { allowHttp: true })

const keypair = Keypair.fromSecret(ENV_SECRET)
const pubkey = keypair.publicKey()

const contractId = ENV_CONTRACT_ID
const networkPassphrase = Networks.STANDALONE

const args = [
    nativeToScVal(1500, { type: 'u32' }),
    nativeToScVal(200, { type: 'u32' }),
    nativeToScVal(20, { type: 'u32' }),
    nativeToScVal(40, { type: 'u32' }),
    nativeToScVal(1, { type: 'u32' }),
    nativeToScVal(Buffer.alloc(71_680)),
]

const source = await rpc
    .getAccount(pubkey)
    .then((account) => new Account(account.accountId(), account.sequenceNumber()))

const simTx = new TransactionBuilder(source, {
    fee: '0',
    networkPassphrase
})
    .addOperation(Operation.invokeContractFunction({
        contract: contractId,
        function: 'run',
        args
    }))
    .setTimeout(0)
    .build()

const simRes = await rpc.simulateTransaction(simTx)

if (SorobanRpc.Api.isSimulationSuccess(simRes))
    console.log(sorobill(simRes));
```

## With a TX
```ts
import { Account, Keypair, Networks, Operation, SorobanRpc, TransactionBuilder, nativeToScVal } from "@stellar/stellar-sdk";
import { sorobill } from "sorobill";

const rpcUrl = 'http://localhost:8000/soroban/rpc'
const rpc = new SorobanRpc.Server(rpcUrl, { allowHttp: true })

const keypair = Keypair.fromSecret(ENV_SECRET)
const pubkey = keypair.publicKey()

const contractId = ENV_CONTRACT_ID
const networkPassphrase = Networks.STANDALONE

const MAX_U32 = (2 ** 32) - 1

const args = [
    nativeToScVal(1500, { type: 'u32' }),
    nativeToScVal(200, { type: 'u32' }),
    nativeToScVal(20, { type: 'u32' }),
    nativeToScVal(40, { type: 'u32' }),
    nativeToScVal(1, { type: 'u32' }),
    nativeToScVal(Buffer.alloc(71_680)),
]

const source = await rpc
    .getAccount(pubkey)
    .then((account) => new Account(account.accountId(), account.sequenceNumber()))

const simTx = new TransactionBuilder(source, {
    fee: '0',
    networkPassphrase
})
    .addOperation(Operation.invokeContractFunction({
        contract: contractId,
        function: 'run',
        args
    }))
    .setTimeout(0)
    .build()

const simRes = await rpc.simulateTransaction(simTx)

if (SorobanRpc.Api.isSimulationSuccess(simRes)) {
    simRes.minResourceFee = MAX_U32.toString()

    const resources = simRes.transactionData.build().resources()
    const tx = SorobanRpc.assembleTransaction(simTx, simRes)
        .setSorobanData(simRes.transactionData
            .setResourceFee(100_000_000)
            .setResources(MAX_U32, resources.readBytes(), resources.writeBytes())
            .build()
        )
        .build()

    tx.sign(keypair)

    const sendRes = await rpc.sendTransaction(tx)

    if (sendRes.status === 'PENDING') {
        await Bun.sleep(5000);
        const getRes = await rpc.getTransaction(sendRes.hash)

        if (getRes.status === 'SUCCESS')
            console.log(await sorobill(simRes, getRes));
    }
}
```