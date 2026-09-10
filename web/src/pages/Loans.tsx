import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, baseSymbol, todayLocal } from '../api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Amount, Confirm, Eyebrow, PageHeader, ShareSwitch } from '@/components/shared'

export type Loan = {
  id: string; counterparty: string; direction: 'lent' | 'borrowed'; principal: string
  start_date: string; due_date: string | null; note: string | null; status: 'open' | 'settled'
  paid: number; advanced: number; outstanding: number
  visibility: 'shared' | 'private'
}
type Payment = { id: string; amount: string; kind: 'repayment' | 'advance'; paidOn: string; note: string | null }
type LoanDetail = Loan & { payments: Payment[] }

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export const isOverdue = (l: Loan) => l.status === 'open' && !!l.due_date && l.due_date < todayLocal()

/** Open loans and their totals — Home and More both summarise them, this is the one source. */
export function useOpenLoans() {
  const { data } = useQuery({ queryKey: ['loans', 'open'], queryFn: () => api<Loan[]>('/loans?status=open') })
  const open = data ?? []
  const sum = (direction: Loan['direction']) =>
    open.filter((l) => l.direction === direction).reduce((s, l) => s + l.outstanding, 0)
  return { open, owedToUs: sum('lent'), weOwe: sum('borrowed'), overdue: open.filter(isOverdue) }
}

// every statement row shares this grid so the amounts line up in one column and the remove button
// gets a gutter of its own — as a flex row it shoved the payment amounts out of line with the total
const STATEMENT_ROW = 'grid grid-cols-[1fr_auto_1.25rem] items-baseline gap-2'

export default function Loans() {
  const [status, setStatus] = useState<'open' | 'settled'>('open')
  const [adding, setAdding] = useState(false)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const loans = useQuery({ queryKey: ['loans', status], queryFn: () => api<Loan[]>(`/loans?status=${status}`) })

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Loans / Qarz"
        right={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus data-icon="inline-start" />
            Add loan
          </Button>
        }
      />

      <ToggleGroup className="w-full" variant="outline" size="sm" value={[status]}
        onValueChange={(v: string[]) => v[0] && setStatus(v[0] as 'open' | 'settled')}>
        <ToggleGroupItem value="open" className="flex-1">Open</ToggleGroupItem>
        <ToggleGroupItem value="settled" className="flex-1">Settled</ToggleGroupItem>
      </ToggleGroup>

      {loans.isLoading && <Skeleton className="h-40 rounded-xl" />}

      {loans.data?.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{status === 'open' ? 'No open loans' : 'No settled loans yet'}</EmptyTitle>
            <EmptyDescription>
              {status === 'open' ? 'Money you lend or borrow shows up here with its full repayment history.' : 'Loans you close appear here.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {loans.data && loans.data.length > 0 && (
        <Card className="gap-0 py-0">
          {loans.data.map((l, i) => {
            const forgiven = l.status === 'settled' && l.outstanding > 0
            return (
              <button key={l.id} onClick={() => setViewingId(l.id)}
                className={cn('flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-accent', i > 0 && 'border-t')}>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{l.counterparty}</span>
                    <Badge variant={l.direction === 'borrowed' ? 'destructive' : 'secondary'}>
                      {l.direction === 'lent' ? 'owes us' : 'we owe'}
                    </Badge>
                    {isOverdue(l) && <Badge variant="destructive">overdue</Badge>}
                    {l.visibility === 'shared' && <Badge variant="outline">shared</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    since {fmtDate(l.start_date)}
                    {l.status === 'open' && l.due_date && <> · due {fmtDate(l.due_date)}</>}
                    {forgiven && <> · forgave <Amount value={l.outstanding} className="text-xs" /></>}
                  </div>
                </div>
                {l.status === 'open'
                  ? <Amount value={l.outstanding} className={cn('shrink-0 text-sm', l.direction === 'borrowed' && 'text-outflow')} />
                  : <Badge variant="secondary">settled</Badge>}
              </button>
            )
          })}
        </Card>
      )}

      <Drawer open={adding} onOpenChange={setAdding}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle>New loan</DrawerTitle></DrawerHeader>
          <div className="mx-auto w-full max-w-lg px-4 pb-6"><AddLoan onDone={() => setAdding(false)} /></div>
        </DrawerContent>
      </Drawer>

      <Drawer open={!!viewingId} onOpenChange={(open) => !open && setViewingId(null)}>
        <DrawerContent>
          {viewingId && <LoanStatement id={viewingId} onDone={() => setViewingId(null)} />}
        </DrawerContent>
      </Drawer>
    </div>
  )
}

const DIRECTIONS = [
  { value: 'lent', label: 'I lent' },
  { value: 'borrowed', label: 'I borrowed' },
]

function AddLoan({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ direction: 'lent', counterparty: '', principal: '', note: '', start: todayLocal(), due: '' })
  const [shared, setShared] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api('/loans', {
        method: 'POST',
        json: {
          direction: form.direction, counterparty: form.counterparty, principal: Number(form.principal),
          start_date: form.start || undefined, due_date: form.due || undefined,
          note: form.note || undefined, visibility: shared ? 'shared' : 'private',
        },
      })
      qc.invalidateQueries({ queryKey: ['loans'] })
      qc.invalidateQueries({ queryKey: ['zakat'] })
      toast('Loan added')
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the loan')
    }
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Direction</FieldLabel>
            <Select items={DIRECTIONS} value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v as string })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {DIRECTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="l-amount">Amount</FieldLabel>
            <InputGroup>
              <InputGroupAddon>{baseSymbol()}</InputGroupAddon>
              <InputGroupInput id="l-amount" type="number" min="1" required className="amount"
                value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
            </InputGroup>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="l-person">Person</FieldLabel>
          <Input id="l-person" placeholder='e.g. "Ahmed bhai"' required
            value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="l-note">Note</FieldLabel>
          <Input id="l-note" placeholder="Optional — what was it for?" value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="l-start">Date</FieldLabel>
            <Input id="l-start" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="l-due">Due back</FieldLabel>
            <Input id="l-due" type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          </Field>
        </div>
        <ShareSwitch checked={shared} onChange={setShared} />
        <Button type="submit" className="w-full">Add loan</Button>
      </FieldGroup>
    </form>
  )
}

function LoanStatement({ id, onDone }: { id: string; onDone: () => void }) {
  const qc = useQueryClient()
  const loan = useQuery({ queryKey: ['loan', id], queryFn: () => api<LoanDetail>(`/loans/${id}`) })
  const [entry, setEntry] = useState({ kind: 'repayment', amount: '', note: '', on: todayLocal() })
  const l = loan.data

  function refresh() {
    qc.invalidateQueries({ queryKey: ['loans'] })
    qc.invalidateQueries({ queryKey: ['loan', id] })
    qc.invalidateQueries({ queryKey: ['zakat'] })
  }

  async function addEntry(e: React.FormEvent) {
    e.preventDefault()
    await api(`/loans/${id}/payments`, {
      method: 'POST',
      json: { amount: Number(entry.amount), kind: entry.kind, paid_on: entry.on, note: entry.note || undefined },
    })
    setEntry({ ...entry, amount: '', note: '' })
    refresh()
    toast(entry.kind === 'advance' ? 'Added to the loan' : 'Repayment recorded')
  }

  async function removeEntry(paymentId: string) {
    await api(`/loans/${id}/payments/${paymentId}`, { method: 'DELETE' })
    refresh()
    toast('Line removed')
  }

  async function setStatus(status: 'open' | 'settled') {
    await api(`/loans/${id}`, { method: 'PATCH', json: { status } })
    refresh()
    toast(status === 'settled' ? 'Loan settled' : 'Loan reopened')
    onDone()
  }

  if (!l) return <div className="p-6"><Skeleton className="h-48" /></div>
  const lent = l.direction === 'lent'
  const moreLabel = lent ? 'Lent more' : 'Borrowed more'

  return (
    <>
      <DrawerHeader>
        <DrawerTitle>{l.counterparty} · {lent ? 'owes us' : 'we owe'}</DrawerTitle>
      </DrawerHeader>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pb-6">
        <div>
          <Eyebrow className="mb-1">Statement</Eyebrow>
          <div className={cn(STATEMENT_ROW, 'py-1.5 text-sm')}>
            <span>
              {fmtDate(l.start_date)} · {lent ? 'Lent' : 'Borrowed'}
              {l.note && <span className="text-muted-foreground"> — {l.note}</span>}
            </span>
            <Amount value={l.principal} className="text-sm" />
            <span />
          </div>
          {l.payments.map((p) => {
            const advance = p.kind === 'advance'
            return (
              <div key={p.id} className={cn(STATEMENT_ROW, 'border-t py-1.5 text-sm')}>
                <span className="text-muted-foreground">
                  {fmtDate(p.paidOn)} · {advance ? moreLabel : lent ? 'Received' : 'Repaid'}
                  {p.note && <> — {p.note}</>}
                </span>
                <Amount value={p.amount} flow={advance !== lent ? 'in' : 'out'} signed className="text-sm" />
                <Confirm
                  title="Remove this line?"
                  description={`${advance ? moreLabel : lent ? 'Received' : 'Repaid'} ${baseSymbol()} ${Number(p.amount).toLocaleString()} on ${fmtDate(p.paidOn)}. The balance goes back up by that much.`}
                  actionLabel="Remove"
                  onConfirm={() => removeEntry(p.id)}
                  trigger={
                    <button type="button" aria-label={`Remove ${fmtDate(p.paidOn)} line`}
                      className="-m-2 self-center justify-self-end p-2 text-muted-foreground hover:text-destructive active:text-destructive">
                      <X className="size-3.5" />
                    </button>
                  }
                />
              </div>
            )
          })}
          <Separator />
          <div className={cn(STATEMENT_ROW, 'py-2 text-sm font-semibold')}>
            <span>{l.status === 'settled' ? (l.outstanding > 0 ? 'Forgiven' : 'Settled') : 'Outstanding'}</span>
            <Amount value={l.outstanding} className={cn('text-sm', l.status === 'open' && !lent && 'text-outflow')} />
            <span />
          </div>
          {l.due_date && l.status === 'open' && (
            <div className={cn('text-xs', isOverdue(l) ? 'text-destructive' : 'text-muted-foreground')}>
              Due {fmtDate(l.due_date)}{isOverdue(l) && ' — overdue'}
            </div>
          )}
        </div>

        <ShareSwitch checked={l.visibility === 'shared'} onChange={async (v) => {
          await api(`/loans/${id}`, { method: 'PATCH', json: { visibility: v ? 'shared' : 'private' } })
          refresh()
          toast(v ? 'Now visible to the household' : 'Now private to you')
        }} />

        {l.status === 'open' && (
          <form className="flex flex-col gap-2" onSubmit={addEntry}>
            <ToggleGroup className="w-full" variant="outline" size="sm" value={[entry.kind]}
              onValueChange={(v: string[]) => v[0] && setEntry({ ...entry, kind: v[0] })}>
              <ToggleGroupItem value="repayment" className="flex-1">{lent ? 'Received' : 'Repaid'}</ToggleGroupItem>
              <ToggleGroupItem value="advance" className="flex-1">{moreLabel}</ToggleGroupItem>
            </ToggleGroup>
            <div className="flex items-center gap-2">
              <InputGroup className="flex-1">
                <InputGroupAddon>{baseSymbol()}</InputGroupAddon>
                <InputGroupInput type="number" min="1" required aria-label="Amount"
                  placeholder={entry.kind === 'advance' ? 'Amount given' : 'Repayment amount'}
                  className="amount" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} />
              </InputGroup>
              <Input type="date" aria-label="Date" className="w-auto" value={entry.on}
                onChange={(e) => setEntry({ ...entry, on: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Input placeholder="What was it? e.g. Raast transfer" aria-label="Description"
                value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} />
              <Button type="submit">Record</Button>
            </div>
          </form>
        )}

        <EditLoan loan={l} onSaved={refresh} />

        {l.status === 'open' ? (
          <Confirm
            title="Settle this loan?"
            description={l.outstanding > 0
              ? `The remaining ${baseSymbol()} ${l.outstanding.toLocaleString()} will be marked as forgiven.`
              : 'The loan is fully repaid and will move to Settled.'}
            actionLabel="Settle"
            onConfirm={() => setStatus('settled')}
            trigger={<Button variant="outline" className="text-destructive">Settle loan</Button>}
          />
        ) : (
          <Button variant="outline" onClick={() => setStatus('open')}>Reopen loan</Button>
        )}

        <Confirm
          title="Delete this loan?"
          description="The whole statement goes with it. Settle it instead if the money was really lent."
          actionLabel="Delete"
          onConfirm={async () => {
            await api(`/loans/${id}`, { method: 'DELETE' })
            refresh()
            toast('Loan deleted')
            onDone()
          }}
          trigger={<Button variant="ghost" className="text-destructive">Delete loan</Button>}
        />
      </div>
    </>
  )
}

function EditLoan({ loan, onSaved }: { loan: LoanDetail; onSaved: () => void }) {
  const [form, setForm] = useState({
    counterparty: loan.counterparty, principal: String(Number(loan.principal)),
    start: loan.start_date, due: loan.due_date ?? '',
  })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    await api(`/loans/${loan.id}`, {
      method: 'PATCH',
      json: {
        counterparty: form.counterparty, principal: Number(form.principal),
        start_date: form.start, due_date: form.due || null,
      },
    })
    onSaved()
    toast('Loan updated')
  }

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-primary">Edit details</summary>
      <form className="mt-2 flex flex-col gap-2" onSubmit={save}>
        <Input aria-label="Person" required value={form.counterparty}
          onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
        <InputGroup>
          <InputGroupAddon>{baseSymbol()}</InputGroupAddon>
          <InputGroupInput type="number" min="1" required aria-label="Opening amount" className="amount"
            value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
        </InputGroup>
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" aria-label="Start date" value={form.start}
            onChange={(e) => setForm({ ...form, start: e.target.value })} />
          <Input type="date" aria-label="Due date" value={form.due}
            onChange={(e) => setForm({ ...form, due: e.target.value })} />
        </div>
        <Button type="submit" variant="outline">Save changes</Button>
      </form>
    </details>
  )
}
