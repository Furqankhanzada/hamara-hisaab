import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { api } from '../api'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Amount, Eyebrow, PageHeader } from '@/components/shared'
import { TxForm, type Tx } from '../TxForm'

const PAGE = 50

export default function Transactions() {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Tx | null>(null)
  const list = useInfiniteQuery({
    queryKey: ['transactions', q],
    queryFn: ({ pageParam }) => api<Tx[]>(`/transactions?limit=${PAGE}&offset=${pageParam}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length === PAGE ? pages.length * PAGE : undefined),
  })
  const rows = list.data?.pages.flat() ?? []

  // sentinel below the list: entering the viewport pulls the next page from local SQLite
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage()
    })
    io.observe(el)
    return () => io.disconnect()
  }, [list.hasNextPage, list.isFetchingNextPage, list.fetchNextPage])

  const byDate = new Map<string, Tx[]>()
  for (const t of rows) byDate.set(t.occurredOn, [...(byDate.get(t.occurredOn) ?? []), t])

  return (
    <div>
      <PageHeader title="Ledger" />
      <InputGroup className="mb-4">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} />
      </InputGroup>

      {list.isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      )}

      {!list.isLoading && rows.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{q ? 'No entries match' : 'The ledger is empty'}</EmptyTitle>
            <EmptyDescription>
              {q ? 'Try a different search.' : 'Add your first entry with the + button below.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <div className="flex flex-col gap-4">
        {[...byDate.entries()].map(([date, txs]) => {
          const dayOut = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
          return (
            <section key={date}>
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <Eyebrow>
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' })}
                </Eyebrow>
                {dayOut > 0 && <Amount value={dayOut} flow="out" className="text-[11px]" signed />}
              </div>
              <Card className="gap-0 py-0">
                {txs.map((t, i) => (
                  <button
                    key={t.id}
                    onClick={() => setEditing(t)}
                    className={cn('flex w-full items-start justify-between gap-3 px-4 py-3 text-left active:bg-accent', i > 0 && 'border-t')}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="truncate">{t.category ?? 'Uncategorized'}</span>
                        {t.source === 'recurring' && <Badge variant="secondary">auto</Badge>}
                      </div>
                      {t.tags?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {t.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                        </div>
                      )}
                      <div className="text-xs break-words text-muted-foreground">
                        {t.originalCurrency && (
                          <>
                            <Amount value={t.originalAmount} currency={t.originalCurrency} className="text-xs" />
                            {' @ '}{Number(t.fxRate).toFixed(2)}{' · '}
                          </>
                        )}
                        {t.note ? `${t.note} · ` : ''}{t.paidBy}
                      </div>
                    </div>
                    <Amount value={t.amount} flow={t.type === 'income' ? 'in' : 'out'} signed className="shrink-0 text-sm" />
                  </button>
                ))}
              </Card>
            </section>
          )
        })}
      </div>

      <div ref={sentinel} data-testid="ledger-sentinel" className="h-8">
        {list.isFetchingNextPage && (
          <div className="flex justify-center py-2">
            <Spinner />
          </div>
        )}
      </div>

      <Drawer open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Edit entry</DrawerTitle>
          </DrawerHeader>
          <div className="mx-auto w-full max-w-lg px-4 pb-6">
            {editing && <TxForm existing={editing} onDone={() => setEditing(null)} />}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
