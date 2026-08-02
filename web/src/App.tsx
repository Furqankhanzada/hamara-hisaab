import { useEffect, useRef, useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { House, NotebookText, ChartNoAxesCombined, Ellipsis, Plus, type LucideIcon } from 'lucide-react'
import { api, fmt } from './api'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Confirm } from '@/components/shared'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { TxForm } from './TxForm'
import { HouseholdSetup, Login } from './pages/Login'
import Dashboard from './pages/Dashboard'
import Reports from './pages/Reports'
import Loans from './pages/Loans'
import Transactions from './pages/Transactions'
import Budgets from './pages/Budgets'
import Portfolio from './pages/Portfolio'
import More from './pages/More'
import Activity from './pages/Activity'
import { clearLocal, onChange } from './local/store'
import { discardEntry, pendingCount, pendingEntries, syncNow, syncState, type PendingEntry, type SyncState } from './local/outbox'
import { describeEntry } from './local/describe'
import { connectLive, disconnectLive } from './local/live'
import { Badge } from '@/components/ui/badge'

export type Me = {
  user: { id: string; name: string; email: string; householdId: string | null }
  household: { id: string; name: string; inviteCode: string; timezone: string; baseCurrency: string; members: { id: string; name: string; email: string }[] } | null
}

function Tab({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'relative flex flex-1 flex-col items-center gap-0.5 pt-2.5 pb-2 text-[11px] font-medium',
          isActive
            ? 'text-primary before:absolute before:inset-x-6 before:top-0 before:h-0.5 before:bg-primary'
            : 'text-muted-foreground',
        )
      }
    >
      <Icon className="size-5" strokeWidth={1.75} />
      {label}
    </NavLink>
  )
}

/** Local-first sync: pull the snapshot on boot/focus/reconnect; requery pages when local data changes. */
function useSyncEngine() {
  const qc = useQueryClient()
  // null while signed in; otherwise how many writes are stranded in the outbox waiting on a session
  const [signedOut, setSignedOut] = useState<number | null>(null)
  const resync = useRef(() => {})
  useEffect(() => {
    const unsubscribe = onChange(() => qc.invalidateQueries())
    const doSync = async () => {
      // flush queued writes first, then pull; never wipe local data while writes are still queued
      const result = await syncNow()
      if (result === 'unauthorized') {
        disconnectLive()
        const stranded = await pendingCount()
        setSignedOut(stranded) // Login takes over — /me is served from the mirror and would never 401
        if (stranded === 0) {
          await clearLocal() // session gone (or another account) — nothing to lose, drop the mirror
          qc.invalidateQueries()
        }
      } else {
        setSignedOut(null)
        // 'forbidden' = signed in but no household yet; HouseholdSetup is next, there's nothing to stream
        if (result !== 'forbidden') connectLive(() => void doSync()) // push: server nudges on any household mutation
      }
    }
    resync.current = () => void doSync()
    void doSync()
    const onWake = () => void doSync()
    // visibilitychange is the reliable resume signal on mobile PWAs (focus often never fires there)
    const onVisible = () => {
      if (document.hidden) disconnectLive() // no point holding a stream in the background
      else onWake()
    }
    // slow fallback poll — safety net for a silently dead stream, push is the mechanism
    const poll = setInterval(() => { if (!document.hidden && navigator.onLine) void doSync() }, 300_000)
    window.addEventListener('focus', onWake)
    window.addEventListener('online', onWake)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      unsubscribe()
      clearInterval(poll)
      disconnectLive()
      window.removeEventListener('focus', onWake)
      window.removeEventListener('online', onWake)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [qc])
  return { signedOut, resync: () => resync.current() }
}

/** The queue, in plain language: what's waiting, why it's stuck, and a way out of a bad entry. */
function PendingSheet({ open, onOpenChange, entries }: {
  open: boolean; onOpenChange: (v: boolean) => void; entries: PendingEntry[]
}) {
  const reachable = navigator.onLine && syncState() !== 'offline'
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Waiting to sync ({entries.length})</DrawerTitle>
          <DrawerDescription>
            {reachable
              ? 'Saved on this device and being sent to the server now.'
              : "Saved on this device. They'll be sent automatically once the server is reachable."}
          </DrawerDescription>
        </DrawerHeader>
        <div className="max-h-[50vh] overflow-y-auto px-4 pb-2">
          {entries.map((e, i) => {
            const { label, amount } = describeEntry(e.method, e.path, JSON.parse(e.body))
            return (
              <div key={e.seq} className="flex items-center gap-3 border-b py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{label}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                    {i === 0 && reachable && entries.length > 1 && ' · sending first'}
                  </div>
                </div>
                {amount != null && <span className="amount text-sm">{fmt(amount)}</span>}
                <Confirm
                  title="Discard this change?"
                  description="It was never sent to the server, so it will be gone for good."
                  actionLabel="Discard"
                  onConfirm={() => void discardEntry(e.seq)}
                  trigger={<Button variant="ghost" size="sm" aria-label={`Discard ${label}`}>Discard</Button>}
                />
              </div>
            )
          })}
        </div>
        <DrawerFooter>
          <Button variant="outline" onClick={() => void syncNow()}>Try again now</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

/** Shows only when something needs attention: not connected, or writes waiting to sync. */
function SyncBadge() {
  const [entries, setEntries] = useState<PendingEntry[]>([])
  // navigator.onLine only knows about the *device*; a reachable network with a dead server looked
  // identical to a healthy sync, which is how "Syncing 2…" stayed up for three days.
  const [state, setState] = useState<{ online: boolean; sync: SyncState }>(
    { online: navigator.onLine, sync: syncState() })
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const update = () => {
      setState({ online: navigator.onLine, sync: syncState() })
      void pendingEntries().then(setEntries)
    }
    update()
    const unsubscribe = onChange(update)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      unsubscribe()
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const pending = entries.length
  const unreachable = !state.online || state.sync === 'offline'
  if (!unreachable && pending === 0) return null
  const label = !state.online
    ? pending > 0 ? `Offline — ${pending} saved locally` : 'Offline'
    : state.sync === 'offline'
      ? pending > 0 ? `Can't reach server — ${pending} saved locally` : "Can't reach server"
      : `Syncing ${pending}…`
  return (
    <>
      <div className="fixed inset-x-0 bottom-16 z-20 mb-[env(safe-area-inset-bottom)] flex justify-center">
        <Badge variant="secondary" className="shadow-sm" render={
          <button type="button" disabled={pending === 0} onClick={() => setOpen(true)} />
        }>
          {label}
        </Badge>
      </div>
      <PendingSheet open={open} onOpenChange={setOpen} entries={entries} />
    </>
  )
}

export default function App() {
  const { signedOut, resync } = useSyncEngine()
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me'), retry: false })
  const [addOpen, setAddOpen] = useState(false)

  // signing back in must resync: the queue only drains once there's a session again
  if (me.isError || signedOut !== null) return <Login stranded={signedOut ?? 0} onSignedIn={resync} />
  if (!me.data) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 p-6">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }
  if (!me.data.user.householdId) return <HouseholdSetup />

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-24">
      <main className="p-4">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/loans" element={<Loans />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/more" element={<More me={me.data} />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <SyncBadge />

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-lg items-stretch">
          <Tab to="/" icon={House} label="Home" />
          <Tab to="/transactions" icon={NotebookText} label="Ledger" />
          <div className="flex flex-1 items-center justify-center">
            <button
              aria-label="Add entry"
              onClick={() => setAddOpen(true)}
              className="flex size-11 -translate-y-3 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md outline-ring/50 active:scale-95"
            >
              <Plus className="size-5" strokeWidth={2.25} />
            </button>
          </div>
          <Tab to="/portfolio" icon={ChartNoAxesCombined} label="Invest" />
          <Tab to="/more" icon={Ellipsis} label="More" />
        </div>
      </nav>

      <Drawer open={addOpen} onOpenChange={setAddOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>New entry</DrawerTitle>
          </DrawerHeader>
          <div className="mx-auto w-full max-w-lg px-4 pb-6">
            <TxForm onDone={() => setAddOpen(false)} />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
