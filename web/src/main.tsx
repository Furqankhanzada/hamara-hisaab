import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import App from './App'
import './index.css'

// autoUpdate mode: a new deploy takes control immediately and reloads the page;
// the hourly update() covers installed PWAs that stay open for days
registerSW({ immediate: true, onRegisteredSW: (_url, r) => setInterval(() => void r?.update(), 60 * 60 * 1000) })

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } })

createRoot(document.getElementById('root')!).render(
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster position="top-center" />
      </BrowserRouter>
    </QueryClientProvider>
  </ThemeProvider>,
)

