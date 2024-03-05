# sorobill
[Relevant blog post](https://kalepail.com/blockchain/show-me-the-bill-part-2)

## Step 1
Run a `--limits unlimited` local network.
```bash
docker run --rm -i \
    -p "8000:8000" \
    --name stellar \
    stellar/quickstart:pr579-latest \
    --local \
    --limits unlimited \
    --enable-soroban-rpc \
    --enable-soroban-diagnostic-events
```

## Step 2
Simulate a transaction, optionally submit it, and pass forward the successful results to the `sorobill` method.

### Without a TX
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
```js
{
  cpu_insns: 122636493,
  mem_bytes: 46670477,
  entry_reads: 43,
  entry_writes: 21,
  read_bytes: 143508,
  write_bytes: 68452,
  events_and_return_bytes: 8272,
  min_txn_bytes: undefined,
  max_entry_bytes: undefined,
  max_key_bytes: 352,
}
```

### With a TX
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
```js
{
  cpu_insns: 130351778,
  mem_bytes: 47448018,
  entry_reads: 43,
  entry_writes: 21,
  read_bytes: 143508,
  write_bytes: 68452,
  events_and_return_bytes: 8272,
  min_txn_bytes: 76132,
  max_entry_bytes: 66920,
  max_key_bytes: 352,
}
```
