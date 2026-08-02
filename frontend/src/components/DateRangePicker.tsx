import React from 'react'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'

export type DatePreset = 'today' | '7d' | '12m' | 'ytd' | 'fy' | 'all' | 'custom'

interface DateRangePickerProps {
  preset: DatePreset
  onPresetChange: (preset: DatePreset) => void
  customFrom?: string
  customTo?: string
  onCustomChange?: (from: string, to: string) => void
}

const presets: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7D' },
  { id: '12m', label: '12M' },
  { id: 'ytd', label: 'YTD' },
  { id: 'fy', label: 'FY' },
  { id: 'all', label: 'All' },
]

export const DateRangePicker: React.FC<DateRangePickerProps> = ({ preset, onPresetChange }) => {
  return (
    <SegmentedControl
      value={preset}
      onChange={value => onPresetChange(value as DatePreset)}
      label="Date range"
    >
      {presets.map(p => (
        <SegmentedControlItem key={p.id} value={p.id} label={p.label} />
      ))}
    </SegmentedControl>
  )
}
