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

  const btn = "h-16 rounded-2xl bg-surface-800/80 border border-white/[0.06] text-2xl font-semibold text-white hover:bg-surface-700 active:bg-surface-600 active:scale-95 transition-all"

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 min-h-0 overflow-hidden">
      {/* Amount display */}
      <div className="pb-4 text-center shrink-0">
        <p className="text-3xl font-bold tracking-tight tabular-nums text-white">
          {displayValue}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {currency === 'SAT' ? 'sats' : 'USD'}
        </p>
      </div>

      {/* Numpad — fixed button heights, centered */}
      <div className="grid grid-cols-3 gap-1.5 w-full max-w-xs shrink-0">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
          <button key={digit} onClick={() => handleDigit(digit)} className={btn}>
            {digit}
          </button>
        ))}
        <button onClick={handleClear} className={`${btn} !text-sm !font-semibold !text-gray-400`}>C</button>
        <button onClick={() => handleDigit('0')} className={btn}>0</button>
        {currency === 'USD' ? (
          <button onClick={() => handleDigit('.')} className={btn}>.</button>
        ) : (
          <button onClick={handleBackspace} className={`${btn} !text-gray-400 flex items-center justify-center`}>
            <Delete className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}
