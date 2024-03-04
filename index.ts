import { SorobanRpc, scValToNative } from '@stellar/stellar-sdk'

export function sorobill(sim: SorobanRpc.Api.SimulateTransactionSuccessResponse, tx: SorobanRpc.Api.GetSuccessfulTransactionResponse) {
    const events = sim.events.map((e) => {
        const event = e.event()

        if (event.type().name !== 'contract')
            return 0

        return event.toXDR().length
    })

    const events_and_return_bytes = (
        events.reduce(
            (accumulator: number, currentValue: number) => accumulator + currentValue, // events
            sim.result?.retval.toXDR().length || 0 // return value size
        )
    )

    const sorobanTransactionData = sim.transactionData.build()
    const resources = sorobanTransactionData.resources()

    const metrics: any = {
        max_rw_key_byte: undefined,
        write_entry: resources.footprint().readWrite().length,
        read_entry: resources.footprint().readOnly().length,
        ledger_write_byte: resources.writeBytes(),
        ledger_read_byte: resources.readBytes(),
        cpu_insn: Number(sim.cost.cpuInsns),
        mem_byte: Number(sim.cost.memBytes),
    }

    let entries: number[] = []

    tx.resultMetaXdr
        .v3()
        .sorobanMeta()
        ?.diagnosticEvents()
        .forEach((e) => {
            const event = e.event()
            const topics = event.body().v0().topics()
            const is_core_metrics_event = topics.some((topic) => scValToNative(topic) === 'core_metrics')

            for (const metric in metrics) {
                const is_metric = topics.some((topic) => scValToNative(topic) === metric)

                if (is_core_metrics_event && is_metric) {
                    const data = Number(scValToNative(event.body().v0().data()))

                    if (metric === 'cpu_insn' || metric === 'mem_byte')
                        continue // NOTE blocking for now due to weird issue where core_metric data is > than simulated data
                    else if (metric === 'read_entry')
                        metrics[metric] = data - metrics.write_entry
                    else
                        metrics[metric] = data
                }
            }
        })

    entries = tx.resultMetaXdr
        .v3()
        .operations()
        .flatMap((op) =>
            op.changes().flatMap((change) => {
                switch (change.switch().name) {
                    case 'ledgerEntryCreated':
                        return change.created().data().value().toXDR().length
                    case 'ledgerEntryUpdated':
                        return change.updated().data().value().toXDR().length
                    // NOTE this one is different and unsure if it's relevant as it's key removal not addition
                    // case 'ledgerEntryRemoved':
                    //     return change.removed().data().toXDR().length
                    // NOTE unsure if this one is needed either as I'm unclear what it's for
                    // case 'ledgerEntryState':
                    //     return change.state().data().value().toXDR().length
                    default:
                        return 0
                }
            })
        )

    const stats = {
        cpu_insns: metrics.cpu_insn,
        mem_bytes: metrics.mem_byte,
        entry_reads: metrics.read_entry,
        entry_writes: metrics.write_entry,
        read_bytes: metrics.ledger_read_byte,
        // NOTE This covers both `contractDataEntrySizeBytes` in the case of a contract invocation and `contractMaxSizeBytes` in the case of a WASM install
        write_bytes: metrics.ledger_write_byte,
        events_and_return_bytes,
        /* NOTE
            This field isn't terribly useful as the actual tx size may be larger once you've added all the signatures
            If the tx doesn't even have the sorobanData or auth applied this will be even less useful (and so we `undefined` it)
        */
        min_txn_bytes: tx ? tx.envelopeXdr.toXDR().length : undefined,
        /* NOTE
            This limit is the max single ledger entry size
            You can write 25 keys with a sum total size of 65 KB and a single key max of 64 KB
            It currently cannot be derived from either the tx or the simulation (boo)
            (see https://discord.com/channels/897514728459468821/966788672164855829/1212887348191166484)
            If you're submitting a wasm upload up the max value is likely the wasm binary size
        */
        max_entry_bytes: tx ? entries.length ? Math.max(...entries) : 0 : undefined,
        max_key_bytes: metrics.max_rw_key_byte,
    }

    return stats
}