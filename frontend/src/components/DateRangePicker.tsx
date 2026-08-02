import React from 'react'
import { Calendar } from 'lucide-react'

export type DatePreset = 'today' | '7d' | '12m' | 'ytd' | 'fy' | 'all' | 'custom'

interface DateRangePickerProps {
  preset: DatePreset
  onPresetChange: (preset: DatePreset) => void
  customFrom?: string
  customTo?: string
  onCustomChange?: (from: string, to: string) => void
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomChange
}) => {
  const presets: { id: DatePreset; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: '7d', label: '7D' },
    { id: '12m', label: '12M' },
    { id: 'ytd', label: 'YTD' },
    { id: 'fy', label: 'FY' },
    { id: 'all', label: 'All' },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => onPresetChange(p.id)}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
              preset === p.id
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
