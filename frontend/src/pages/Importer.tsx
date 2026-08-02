import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { formatDate, formatCurrency } from '../lib/format'
import { Upload, CheckCircle2, AlertCircle, FileText, Undo2, ArrowLeft } from 'lucide-react'

export const Importer: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const portfolioId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewData, setPreviewData] = useState<any | null>(null)
  const [committedBatch, setCommittedBatch] = useState<any | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiFetch<any>(`/api/portfolios/${portfolioId}/import/preview`, {
        method: 'POST',
        body: formData
      })
    },
    onSuccess: (data) => {
      setPreviewData(data)
      setErrorMsg('')
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
    }
  })

  const commitMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiFetch<any>(`/api/portfolios/${portfolioId}/import/commit`, {
        method: 'POST',
        body: formData
      })
    },
    onSuccess: (data) => {
      setCommittedBatch(data)
      queryClient.invalidateQueries({ queryKey: ['holdings', portfolioId] })
      queryClient.invalidateQueries({ queryKey: ['valuation', portfolioId] })
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
    }
  })

  const undoMutation = useMutation({
    mutationFn: (batchId: number) => apiFetch(`/api/import-batches/${batchId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setCommittedBatch(null)
      setPreviewData(null)
      setSelectedFile(null)
      queryClient.invalidateQueries({ queryKey: ['holdings', portfolioId] })
      queryClient.invalidateQueries({ queryKey: ['valuation', portfolioId] })
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
    }
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setSelectedFile(file)
      setPreviewData(null)
      setCommittedBatch(null)
      setErrorMsg('')
      previewMutation.mutate(file)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/portfolios/${portfolioId}`)}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Import Sharesight Trades CSV</h1>
          <p className="text-sm text-slate-400">Upload your Sharesight "All trades" export file to populate trades</p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Committed Success Summary */}
      {committedBatch && (
        <div className="glass-card p-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <div>
                <h3 className="text-lg font-bold text-white">Import Committed Successfully</h3>
                <p className="text-sm text-emerald-300">
                  Imported {committedBatch.row_count} trades from {committedBatch.filename}
                </p>
              </div>
            </div>
            <button
              onClick={() => undoMutation.mutate(committedBatch.batch_id)}
              disabled={undoMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold transition"
            >
              <Undo2 className="w-4 h-4" />
              {undoMutation.isPending ? 'Undoing...' : 'Undo Import'}
            </button>
          </div>
        </div>
      )}

      {/* File Upload Box */}
      {!committedBatch && (
        <div className="glass-card p-8 rounded-2xl border border-slate-800 text-center space-y-4">
          <div className="inline-flex p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Upload className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Select Sharesight CSV File</h3>
            <p className="text-xs text-slate-400 mt-1">Supports Sharesight "All trades" export CSVs</p>
          </div>

          <label className="inline-block cursor-pointer px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-900/30 transition">
            Choose CSV File
            <input type="file" onChange={handleFileChange} accept=".csv" className="hidden" />
          </label>
        </div>
      )}

      {/* Preview Table */}
      {previewData && !committedBatch && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Import Preview ({previewData.valid_count} valid trades)</h3>
            <button
              onClick={() => selectedFile && commitMutation.mutate(selectedFile)}
              disabled={commitMutation.isPending || previewData.valid_count === 0}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-900/30 transition disabled:opacity-50"
            >
              {commitMutation.isPending ? 'Committing...' : 'Confirm & Import Trades'}
            </button>
          </div>

          {previewData.error_rows?.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs space-y-1">
              <div className="font-bold uppercase tracking-wider mb-1">Skipped / Invalid Rows ({previewData.error_rows.length}):</div>
              {previewData.error_rows.map((err: any, i: number) => (
                <div key={i}>Row {err.row}: {err.error}</div>
              ))}
            </div>
          )}

          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Row</th>
                  <th className="py-3 px-4">Symbol</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Qty</th>
                  <th className="py-3 px-4 text-right">Price</th>
                  <th className="py-3 px-4 text-right">Brokerage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {previewData.valid_rows.map((r: any) => (
                  <tr key={r.row} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4 text-slate-400">{r.row}</td>
                    <td className="py-3 px-4 font-bold text-white">{r.symbol}</td>
                    <td className="py-3 px-4">{formatDate(r.trade_date)}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${r.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{parseFloat(r.quantity).toFixed(2)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(r.unit_price)}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-400">{formatCurrency(r.brokerage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
