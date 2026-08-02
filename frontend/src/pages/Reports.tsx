import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { formatCurrency, formatDate } from '../lib/format'
import { Download, FileText, Calendar, Info } from 'lucide-react'

export const Reports: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const portfolioId = Number(id)

  const currentYear = new Date().getFullYear()
  const [fy, setFy] = useState(currentYear)
  const [activeTab, setActiveTab] = useState<'cgt' | 'income'>('cgt')

  const { data: cgtReport, isLoading: cgtLoading } = useQuery<any>({
    queryKey: ['report_cgt', portfolioId, fy],
    queryFn: () => apiFetch(`/api/portfolios/${portfolioId}/reports/cgt?fy=${fy}`)
  })

  const { data: incomeReport, isLoading: incomeLoading } = useQuery<any>({
    queryKey: ['report_income', portfolioId, fy],
    queryFn: () => apiFetch(`/api/portfolios/${portfolioId}/reports/income?fy=${fy}`)
  })

  const fyList = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Australian Tax Reports</h1>
          <p className="text-sm text-slate-400">Capital gains tax (CGT) & taxable income reports</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase">Financial Year:</span>
            <select
              value={fy}
              onChange={e => setFy(Number(e.target.value))}
              className="bg-transparent text-white font-bold text-sm focus:outline-none cursor-pointer"
            >
              {fyList.map(y => (
                <option key={y} value={y} className="bg-slate-900 text-white">
                  FY{y} (1 Jul {y - 1} – 30 Jun {y})
                </option>
              ))}
            </select>
          </div>

          <a
            href={`/api/portfolios/${portfolioId}/reports/${activeTab}?fy=${fy}&format=csv`}
            download
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-lg shadow-emerald-900/30 transition"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 flex items-center gap-2">
        <button
          onClick={() => setActiveTab('cgt')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === 'cgt'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Realised CGT Report
        </button>
        <button
          onClick={() => setActiveTab('income')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === 'income'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Taxable Income Report
        </button>
      </div>

      {/* TAB CONTENT: CGT Report */}
      {activeTab === 'cgt' && (
        <div className="space-y-6">
          {cgtReport ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-card p-4 rounded-xl border border-slate-800">
                  <div className="text-xs font-semibold text-slate-400 uppercase">Discounted Gains (50%)</div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">{formatCurrency(cgtReport.summary.net_discounted_gains)}</div>
                  <div className="text-xs text-slate-400 mt-0.5">Gross: {formatCurrency(cgtReport.summary.gross_discounted_gains)}</div>
                </div>
                <div className="glass-card p-4 rounded-xl border border-slate-800">
                  <div className="text-xs font-semibold text-slate-400 uppercase">Non-Discounted Gains</div>
                  <div className="text-xl font-bold text-white mt-1">{formatCurrency(cgtReport.summary.non_discounted_gains)}</div>
                </div>
                <div className="glass-card p-4 rounded-xl border border-slate-800">
                  <div className="text-xs font-semibold text-slate-400 uppercase">Capital Losses</div>
                  <div className="text-xl font-bold text-red-400 mt-1">{formatCurrency(cgtReport.summary.total_losses)}</div>
                </div>
                <div className="glass-card p-4 rounded-xl border border-slate-800 bg-emerald-500/10 border-emerald-500/20">
                  <div className="text-xs font-semibold text-emerald-400 uppercase">Net Taxable CGT Position</div>
                  <div className="text-2xl font-bold text-emerald-300 mt-1">{formatCurrency(cgtReport.summary.net_taxable_position)}</div>
                </div>
              </div>

              {/* Discounted Gains Table */}
              <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800 font-semibold text-white text-sm">
                  Discounted Capital Gains (Held &gt; 12 months)
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/60 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Symbol</th>
                      <th className="py-3 px-4">Acquire Date</th>
                      <th className="py-3 px-4">Sell Date</th>
                      <th className="py-3 px-4 text-right">Qty</th>
                      <th className="py-3 px-4 text-right">Proceeds</th>
                      <th className="py-3 px-4 text-right">Cost Base</th>
                      <th className="py-3 px-4 text-right">Gross Gain</th>
                      <th className="py-3 px-4 text-right">Net Taxable (50%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {cgtReport.discounted_gains.map((g: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-bold text-white">{g.symbol}</td>
                        <td className="py-3 px-4">{formatDate(g.acquire_date)}</td>
                        <td className="py-3 px-4">{formatDate(g.sell_date)}</td>
                        <td className="py-3 px-4 text-right font-mono">{parseFloat(g.quantity).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-mono">{formatCurrency(g.proceeds)}</td>
                        <td className="py-3 px-4 text-right font-mono">{formatCurrency(g.cost_base)}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-400 font-semibold">{formatCurrency(g.gross_gain_loss)}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-300 font-bold">{formatCurrency(g.net_taxable_gain)}</td>
                      </tr>
                    ))}
                    {cgtReport.discounted_gains.length === 0 && (
                      <tr><td colSpan={8} className="py-4 text-center text-slate-500 text-xs">No discounted capital gains in FY{fy}.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Non-Discounted Gains Table */}
              <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800 font-semibold text-white text-sm">
                  Other / Non-Discounted Capital Gains (Held &le; 12 months)
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/60 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Symbol</th>
                      <th className="py-3 px-4">Acquire Date</th>
                      <th className="py-3 px-4">Sell Date</th>
                      <th className="py-3 px-4 text-right">Qty</th>
                      <th className="py-3 px-4 text-right">Proceeds</th>
                      <th className="py-3 px-4 text-right">Cost Base</th>
                      <th className="py-3 px-4 text-right">Taxable Gain</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {cgtReport.non_discounted_gains.map((g: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-bold text-white">{g.symbol}</td>
                        <td className="py-3 px-4">{formatDate(g.acquire_date)}</td>
                        <td className="py-3 px-4">{formatDate(g.sell_date)}</td>
                        <td className="py-3 px-4 text-right font-mono">{parseFloat(g.quantity).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-mono">{formatCurrency(g.proceeds)}</td>
                        <td className="py-3 px-4 text-right font-mono">{formatCurrency(g.cost_base)}</td>
                        <td className="py-3 px-4 text-right font-mono text-white font-bold">{formatCurrency(g.net_taxable_gain)}</td>
                      </tr>
                    ))}
                    {cgtReport.non_discounted_gains.length === 0 && (
                      <tr><td colSpan={7} className="py-4 text-center text-slate-500 text-xs">No non-discounted capital gains in FY{fy}.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-400">Loading CGT report...</div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Income Report */}
      {activeTab === 'income' && (
        <div className="space-y-6">
          {incomeReport ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-card p-4 rounded-xl border border-slate-800">
                  <div className="text-xs font-semibold text-slate-400 uppercase">Total Gross Dividends</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">{formatCurrency(incomeReport.summary.total_gross_amount)}</div>
                </div>
                <div className="glass-card p-4 rounded-xl border border-slate-800">
                  <div className="text-xs font-semibold text-slate-400 uppercase">Franking Credits</div>
                  <div className="text-2xl font-bold text-white mt-1">{formatCurrency(incomeReport.summary.total_franking_credits)}</div>
                </div>
                <div className="glass-card p-4 rounded-xl border border-slate-800">
                  <div className="text-xs font-semibold text-slate-400 uppercase">AMIT Net Adjustment</div>
                  <div className="text-2xl font-bold text-slate-200 mt-1">
                    {formatCurrency(parseFloat(incomeReport.summary.total_amit_increase) - parseFloat(incomeReport.summary.total_amit_decrease))}
                  </div>
                </div>
                <div className="glass-card p-4 rounded-xl border border-slate-800">
                  <div className="text-xs font-semibold text-slate-400 uppercase">Net Payment Received</div>
                  <div className="text-2xl font-bold text-emerald-300 mt-1">{formatCurrency(incomeReport.summary.total_net_payment)}</div>
                </div>
              </div>

              {/* Distributions Table */}
              <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800 font-semibold text-white text-sm">
                  FY{fy} Dividend Distributions
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/60 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Symbol</th>
                      <th className="py-3 px-4">Pay Date</th>
                      <th className="py-3 px-4">Ex Date</th>
                      <th className="py-3 px-4 text-right">Gross Amount</th>
                      <th className="py-3 px-4 text-right">Franking Credits</th>
                      <th className="py-3 px-4 text-right">AMIT Increase</th>
                      <th className="py-3 px-4 text-right">AMIT Decrease</th>
                      <th className="py-3 px-4 text-right">Net Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {incomeReport.distributions.map((d: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-bold text-white">{d.symbol}</td>
                        <td className="py-3 px-4">{formatDate(d.pay_date)}</td>
                        <td className="py-3 px-4">{formatDate(d.ex_date)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">{formatCurrency(d.gross_amount)}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300">{formatCurrency(d.franking_credits)}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-400">+{formatCurrency(d.amit_cost_base_increase)}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-400">-{formatCurrency(d.amit_cost_base_decrease)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">{formatCurrency(d.net_payment)}</td>
                      </tr>
                    ))}
                    {incomeReport.distributions.length === 0 && (
                      <tr><td colSpan={8} className="py-4 text-center text-slate-500 text-xs">No distributions in FY{fy}.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-400">Loading Income report...</div>
          )}
        </div>
      )}
    </div>
  )
}
