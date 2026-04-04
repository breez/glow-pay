import { Delete } from 'lucide-react'

interface POSKeypadProps {
  value: string
  onChange: (value: string) => void
  currency: 'SAT' | 'USD'
}

export function POSKeypad({ value, onChange, currency }: POSKeypadProps) {
  const handleDigit = (digit: string) => {
    if (value === '0' && digit !== '.') {
      onChange(digit)
    } else {
      // For USD allow one decimal point and max 2 decimal places
      if (digit === '.') {
        if (currency === 'SAT' || value.includes('.')) return
        onChange(value + '.')
      } else {
        if (currency === 'USD' && value.includes('.')) {
          const decimals = value.split('.')[1]
          if (decimals && decimals.length >= 2) return
        }
        onChange(value + digit)
      }
    }
  }

  const handleBackspace = () => {
    if (value.length <= 1) {
      onChange('0')
    } else {
      onChange(value.slice(0, -1))
    }
  }

  const handleClear = () => onChange('0')

  const displayValue = currency === 'USD'
    ? `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: value.includes('.') ? (value.split('.')[1]?.length || 0) : 0, maximumFractionDigits: 2 })}`
    : Number(value).toLocaleString()

  return (
    <div className="flex flex-col items-center flex-1 px-6 pt-6">
      {/* Amount display */}
      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <p className="text-5xl font-bold tracking-tight tabular-nums text-white mb-1">
          {displayValue}
        </p>
        <p className="text-sm text-gray-500">
          {currency === 'SAT' ? 'sats' : 'USD'}
        </p>
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-2.5 w-full max-w-xs pb-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
          <button
            key={digit}
            onClick={() => handleDigit(digit)}
            className="h-16 rounded-2xl bg-surface-800/80 border border-white/[0.06] text-2xl font-semibold text-white hover:bg-surface-700 active:bg-surface-600 active:scale-95 transition-all"
          >
            {digit}
          </button>
        ))}
        <button
          onClick={handleClear}
          className="h-16 rounded-2xl bg-surface-800/80 border border-white/[0.06] text-sm font-semibold text-gray-400 hover:bg-surface-700 active:bg-surface-600 active:scale-95 transition-all"
        >
          C
        </button>
        <button
          onClick={() => handleDigit('0')}
          className="h-16 rounded-2xl bg-surface-800/80 border border-white/[0.06] text-2xl font-semibold text-white hover:bg-surface-700 active:bg-surface-600 active:scale-95 transition-all"
        >
          0
        </button>
        {currency === 'USD' ? (
          <button
            onClick={() => handleDigit('.')}
            className="h-16 rounded-2xl bg-surface-800/80 border border-white/[0.06] text-2xl font-semibold text-white hover:bg-surface-700 active:bg-surface-600 active:scale-95 transition-all"
          >
            .
          </button>
        ) : (
          <button
            onClick={handleBackspace}
            className="h-16 rounded-2xl bg-surface-800/80 border border-white/[0.06] text-gray-400 hover:bg-surface-700 active:bg-surface-600 active:scale-95 transition-all flex items-center justify-center"
          >
            <Delete className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}
