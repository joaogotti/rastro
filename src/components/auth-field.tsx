import type { InputHTMLAttributes } from 'react'

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: string
  error?: string
  hint?: string
}

export default function AuthField({ id, label, error, hint, ...props }: AuthFieldProps) {
  const description = error ?? hint

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-200">
        {label}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={description ? `${id}-description` : undefined}
        className="min-h-12 w-full rounded-lg border border-slate-600 bg-slate-950 px-3.5 text-base text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25 disabled:opacity-60"
      />
      {description && (
        <p id={`${id}-description`} className={`mt-2 text-sm ${error ? 'text-red-300' : 'text-slate-400'}`}>
          {description}
        </p>
      )}
    </div>
  )
}
