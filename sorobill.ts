import { xdr } from 'soroban-client'
import fs from 'fs'

const argv = require('minimist')(Bun.argv.slice(2));

const file = fs.readFileSync(argv.file, 'utf8')
const sim = JSON.parse(file)

const events = sim.result.events.map((event) => {
    const e = xdr.DiagnosticEvent.fromXDR(event, 'base64')

    if (e.event().type().name === 'diagnostic')
        return 0

    return e.toXDR().length
})

const events_and_return_value_size = (
    events.reduce((accumulator, currentValue) => accumulator + currentValue, 0) // events
    + Buffer.from(sim.result.results[0].xdr, 'base64').length // return value size
)

const sorobanTransactionData = xdr.SorobanTransactionData.fromXDR(sim.result.transactionData, 'base64')

console.log({
    CPU_instructions: Number(sim.result.cost.cpuInsns),
    RAM: Number(sim.result.cost.memBytes),
    ledger_entry_reads: sorobanTransactionData.resources().footprint().readOnly().length,
    ledger_entry_writes: sorobanTransactionData.resources().footprint().readWrite().length,
    // transaction_size: 0,
    ledger_write_bytes: sorobanTransactionData.resources().writeBytes(),
    ledger_read_bytes: sorobanTransactionData.resources().readBytes(),
    events_and_return_value_size,
    // ledger_entry_size: 0
})