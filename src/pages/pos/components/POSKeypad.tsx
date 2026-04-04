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

  const btn = "aspect-square rounded-2xl bg-surface-800/80 border border-white/[0.06] text-2xl font-semibold text-white hover:bg-surface-700 active:bg-surface-600 active:scale-95 transition-all flex items-center justify-center"

  // Grid is 3 columns × 4 rows of square buttons.
  // max-w-[280px] → each button is ~89px square. Fits all phones without scroll.
  // Total grid height: 4×89 + 3×8 = 380px.
  return (
    <div className="flex flex-col items-center flex-1 justify-center px-4">
      {/* Amount display */}
      <div className="pb-6 text-center">
        <p className="text-4xl font-bold tracking-tight tabular-nums text-white">
          {displayValue}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {currency === 'SAT' ? 'sats' : 'USD'}
        </p>
      </div>

      {/* Numpad — square buttons, fixed max width */}
      <div className="grid grid-cols-3 gap-2 w-full max-w-[280px]">
        <button onClick={() => handleDigit('1')} className={btn}>1</button>
        <button onClick={() => handleDigit('2')} className={btn}>2</button>
        <button onClick={() => handleDigit('3')} className={btn}>3</button>
        <button onClick={() => handleDigit('4')} className={btn}>4</button>
        <button onClick={() => handleDigit('5')} className={btn}>5</button>
        <button onClick={() => handleDigit('6')} className={btn}>6</button>
        <button onClick={() => handleDigit('7')} className={btn}>7</button>
        <button onClick={() => handleDigit('8')} className={btn}>8</button>
        <button onClick={() => handleDigit('9')} className={btn}>9</button>
        <button onClick={handleClear} className={`${btn} !text-sm !font-semibold !text-gray-400`}>C</button>
        <button onClick={() => handleDigit('0')} className={btn}>0</button>
        {currency === 'USD' ? (
          <button onClick={() => handleDigit('.')} className={btn}>.</button>
        ) : (
          <button onClick={handleBackspace} className={`${btn} !text-gray-400`}>
            <Delete className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}
