"use client";

import { useState } from "react";
import Link from "next/link";
import { daysToExpiration, formatExpiration, generateOptionsChain, optionContractId, contractCost } from "@/lib/options";
import { formatCurrency } from "@/lib/format";
import { SegmentedControl } from "./SegmentedControl";
import type { OptionContract, OptionSide, TickerSymbol } from "@/lib/types";

/** Browsable chain for one ticker — calls/puts toggle, grouped by expiration. */
export function OptionsChain({ ticker }: { ticker: TickerSymbol }) {
  const [side, setSide] = useState<OptionSide>("call");
  const chain = generateOptionsChain(ticker).filter((c) => c.side === side);

  const byExpiration = new Map<string, OptionContract[]>();
  for (const contract of chain) {
    const list = byExpiration.get(contract.expiration) ?? [];
    list.push(contract);
    byExpiration.set(contract.expiration, list);
  }

  return (
    <div className="px-5 pb-6 pt-2">
      <SegmentedControl
        label="Option type"
        value={side}
        onChange={setSide}
        options={[
          { value: "call", label: "Calls" },
          { value: "put", label: "Puts" },
        ]}
      />
      <p className="mb-5 mt-3 text-center text-xs leading-relaxed text-neutral-400">
        Simulated premiums, buying only — the most you can lose on any order is what you pay for it.
      </p>

      {[...byExpiration.entries()].map(([expiration, contracts]) => (
        <div key={expiration} className="mb-5">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Exp. {formatExpiration(expiration)}
            </h3>
            <span className="font-mono text-xs text-neutral-400">{daysToExpiration(expiration)}d</span>
          </div>
          <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white">
            {contracts
              .sort((a, b) => a.strike - b.strike)
              .map((contract) => (
                <Link
                  key={optionContractId(contract)}
                  href={`/options/${ticker}/${optionContractId(contract)}`}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 active:bg-neutral-50"
                >
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">
                      <span className="font-mono">{formatCurrency(contract.strike)}</span>{" "}
                      {contract.side === "call" ? "Call" : "Put"}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-400">
                      Premium <span className="font-mono">{formatCurrency(contract.premium)}</span>/share
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold text-neutral-900">
                    {formatCurrency(contractCost(contract.premium, 1))}
                  </span>
                </Link>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
