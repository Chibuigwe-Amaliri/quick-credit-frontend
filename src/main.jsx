import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '')
const TOKEN_KEY = 'quick_credit_token'

const money = (value) =>
  `₦${Number(value || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat('en-NG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'

const errorMessage = (error) =>
  error?.message || 'Something went wrong. Please try again.'

async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      payload?.meta?.error ||
      payload?.meta?.message ||
      payload?.message ||
      `Request failed with status ${response.status}`
    const error = new Error(message)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(null)
  const [booting, setBooting] = useState(Boolean(token))
  const [authError, setAuthError] = useState('')
  const [verificationRequired, setVerificationRequired] = useState(false)

  const loadProfile = useCallback(async () => {
    setBooting(true)
    setAuthError('')
    try {
      const response = await api('/api/v1/users/profile')
      const profile = response?.data?.result?.user
      if (!profile) throw new Error('The server returned an invalid profile.')
      setUser(profile)
      setVerificationRequired(false)
    } catch (error) {
      if (error.status === 401 && token) {
        setVerificationRequired(true)
        setUser(null)
      } else {
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setUser(null)
        setAuthError(errorMessage(error))
      }
    } finally {
      setBooting(false)
    }
  }, [token])

  useEffect(() => {
    if (token) loadProfile()
    else setBooting(false)
  }, [token, loadProfile])

  const handleLogin = (newToken) => {
    localStorage.setItem(TOKEN_KEY, newToken)
    setAuthError('')
    setVerificationRequired(false)
    setToken(newToken)
  }

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    setVerificationRequired(false)
  }

  if (booting) return <LoadingScreen />

  if (!token) {
    return <AuthScreen onLogin={handleLogin} error={authError} />
  }

  if (verificationRequired) {
    return <VerificationScreen onLogout={handleLogout} />
  }

  if (!user) return <LoadingScreen label="Preparing your workspace…" />

  return user.isAdmin ? (
    <AdminDashboard user={user} onLogout={handleLogout} />
  ) : (
    <CustomerDashboard user={user} onLogout={handleLogout} refreshUser={loadProfile} />
  )
}

function LoadingScreen({ label = 'Loading your Quick Credit workspace…' }) {
  return (
    <div className="loading-screen">
      <div className="loader-card">
        <div className="brand-mark">QC</div>
        <span className="spinner" aria-hidden="true" />
        <p>{label}</p>
      </div>
    </div>
  )
}

function AuthScreen({ onLogin, error }) {
  const [mode, setMode] = useState('signin')
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    address: '',
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [localError, setLocalError] = useState('')

  const update = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setLocalError('')

    try {
      if (mode === 'signup') {
        await api('/api/v1/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            email: form.email.trim(),
            password: form.password,
            address: form.address.trim(),
          }),
        })
        setMode('signin')
        setMessage('Account created. Sign in to continue.')
        setForm((current) => ({ ...current, password: '' }))
      } else {
        const response = await api('/api/v1/auth/signin', {
          method: 'POST',
          body: JSON.stringify({
            email: form.email.trim(),
            password: form.password,
          }),
        })
        const newToken = response?.data?.result?.token
        if (!newToken) throw new Error('Sign-in succeeded but no access token was returned.')
        onLogin(newToken)
      }
    } catch (requestError) {
      setLocalError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <div className="auth-brand">
          <div className="brand-mark">QC</div>
          <span>Quick Credit</span>
        </div>

        <div className="auth-card">
          <div className="eyebrow">{mode === 'signin' ? 'Welcome back' : 'Get started'}</div>
          <h1>{mode === 'signin' ? 'Sign in to your account' : 'Create your account'}</h1>
          <p className="subtitle">
            {mode === 'signin'
              ? 'Manage your credit, applications and repayments in one secure place.'
              : 'Create a secure account to start your loan application.'}
          </p>

          {(localError || error) && <Alert type="error">{localError || error}</Alert>}
          {message && <Alert type="success">{message}</Alert>}

          <form className="form" onSubmit={submit}>
            {mode === 'signup' && (
              <div className="form-grid">
                <Field name="firstName" label="First name" value={form.firstName} onChange={update} minLength={5} />
                <Field name="lastName" label="Last name" value={form.lastName} onChange={update} minLength={5} />
              </div>
            )}

            <Field
              name="email"
              label="Email address"
              type="email"
              value={form.email}
              onChange={update}
              autoComplete="email"
            />
            <Field
              name="password"
              label="Password"
              type="password"
              value={form.password}
              onChange={update}
              minLength={5}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />

            {mode === 'signup' && (
              <Field
                name="address"
                label="Residential address"
                value={form.address}
                onChange={update}
                minLength={5}
              />
            )}

            <button className="primary-button full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <button
            className="switch-button"
            onClick={() => {
              setMode((current) => (current === 'signin' ? 'signup' : 'signin'))
              setMessage('')
              setLocalError('')
            }}
          >
            {mode === 'signin' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
          </button>
        </div>

        <p className="security-note">Secure access • Your credentials are transmitted over your API connection.</p>
      </div>
    </div>
  )
}

function Field({ name, label, type = 'text', value, onChange, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required
        {...props}
      />
    </label>
  )
}

function VerificationScreen({ onLogout }) {
  return (
    <div className="loading-screen">
      <div className="status-card">
        <div className="status-icon">✓</div>
        <div className="eyebrow">Account verification</div>
        <h1>Your account needs verification</h1>
        <p>
          Your sign-in was successful, but Quick Credit requires your account to be verified
          before the customer workspace can be opened.
        </p>
        <button className="primary-button" onClick={onLogout}>Sign out</button>
      </div>
    </div>
  )
}

function AppShell({ user, onLogout, children, admin = false, activeNav = 'overview', onNavigate }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase()

  const navigate = (page) => {
    if (onNavigate) onNavigate(page)
    setMenuOpen(false)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">QC</div>
          <div>
            <strong>Quick Credit</strong>
            <small>{admin ? 'Operations' : 'Customer portal'}</small>
          </div>
        </div>

        <nav className="side-nav">
          <span className="nav-label">Workspace</span>
          <button type="button" className={`nav-item ${activeNav === 'overview' ? 'active' : ''}`} onClick={() => navigate('overview')}>
            <span>⌂</span>{admin ? 'Overview' : 'My dashboard'}
          </button>
          <button type="button" className={`nav-item ${activeNav === 'loans' ? 'active' : ''}`} onClick={() => navigate('loans')}>
            <span>▣</span>{admin ? 'Loan applications' : 'My loans'}
          </button>
          <button type="button" className={`nav-item ${activeNav === 'repayments' ? 'active' : ''}`} onClick={() => navigate('repayments')}>
            <span>◷</span>{admin ? 'Repayments' : 'Payment history'}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="support-box">
            <span className="support-dot" />
            <div>
              <strong>System online</strong>
              <small>Quick Credit API connected</small>
            </div>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMenuOpen((v) => !v)} aria-label="Toggle navigation">☰</button>
          <div className="topbar-context">
            <span className="topbar-title">{admin ? 'Operations dashboard' : 'Financial overview'}</span>
            <span className="topbar-date">{new Intl.DateTimeFormat('en-NG', { dateStyle: 'full' }).format(new Date())}</span>
          </div>
          <div className="profile-menu">
            <div className="avatar">{initials}</div>
            <div className="profile-copy">
              <strong>{user.firstName} {user.lastName}</strong>
              <span>{admin ? 'Administrator' : user.email}</span>
            </div>
            <button className="logout-button" onClick={onLogout}>Sign out</button>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}

function CustomerDashboard({ user, onLogout }) {
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [showLoan, setShowLoan] = useState(false)
  const [selectedLoan, setSelectedLoan] = useState(null)

  const loadLoans = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      const response = await api('/api/v1/loan/get-all')
      setLoans(response?.data?.result || [])
    } catch (requestError) {
      // The API returns 404 when the user has no loans; treat that as an empty state.
      if (requestError.status === 404) setLoans([])
      else setError(errorMessage(requestError))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadLoans() }, [loadLoans])

  const activeLoan = loans.find((loan) => loan.status === 'approved' && Number(loan.balance) > 0)
  const totalOutstanding = loans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0)
  const totalBorrowed = loans.reduce((sum, loan) => sum + Number(loan.loanAmount || 0), 0)
  const completed = loans.filter((loan) => loan.status === 'completed').length

  const addLoan = (loan) => {
    setLoans((current) => [loan, ...current])
  }

  const updateLoan = (loanId, patch) => {
    setLoans((current) => current.map((loan) => (
      String(loan.loanId) === String(loanId) ? { ...loan, ...patch } : loan
    )))
  }

  return (
    <AppShell user={user} onLogout={onLogout}>
      <main className="content">
        <section className="welcome-row">
          <div>
            <div className="eyebrow">Customer workspace</div>
            <h1>Good to see you, {user.firstName}.</h1>
            <p>Track your credit journey, monitor repayments and apply when you need funds.</p>
          </div>
          <button className="primary-button" onClick={() => setShowLoan(true)}>+ Apply for a loan</button>
        </section>

        {error && <Alert type="error">{error}</Alert>}

        <section className="metrics-grid">
          <Metric label="Outstanding balance" value={money(totalOutstanding)} icon="₦" />
          <Metric label="Total borrowed" value={money(totalBorrowed)} icon="↗" />
          <Metric label="Applications" value={loans.length} icon="▣" />
          <Metric label="Completed loans" value={completed} icon="✓" />
        </section>

        <section className="dashboard-grid">
          <div className="panel large-panel">
            <PanelHeader
              title="Your loan applications"
              subtitle={loans.length ? `${loans.length} application${loans.length === 1 ? '' : 's'} in your account` : 'Your loan activity will appear here'}
              action={<button className="text-button" onClick={() => loadLoans(true)} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>}
            />

            {loading ? (
              <ListSkeleton />
            ) : loans.length === 0 ? (
              <EmptyState
                icon="₦"
                title="No loan applications yet"
                text="When you submit a loan application, its status and repayment details will appear here."
                action={<button className="primary-button" onClick={() => setShowLoan(true)}>Start an application</button>}
              />
            ) : (
              <div className="loan-list">
                {loans.map((loan) => (
                  <CustomerLoanCard
                    key={String(loan.loanId)}
                    loan={loan}
                    onRepay={() => setSelectedLoan(loan)}
                    onView={() => setSelectedLoan({ ...loan, historyOnly: true })}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <PanelHeader title="Account" subtitle="Your Quick Credit profile" />
            <div className="account-card">
              <div className="profile-large">{`${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase()}</div>
              <h3>{user.firstName} {user.lastName}</h3>
              <p>{user.email}</p>
              <Badge value={user.status} />
            </div>
            <div className="account-detail"><span>Address</span><strong>{user.address || '—'}</strong></div>
            <div className="account-detail"><span>Active loan</span><strong>{activeLoan ? money(activeLoan.balance) : 'None'}</strong></div>
          </div>
        </section>
      </main>

      {showLoan && (
        <LoanModal
          onClose={() => setShowLoan(false)}
          onCreated={addLoan}
        />
      )}

      {selectedLoan && (
        <LoanDetailsModal
          loan={selectedLoan}
          onClose={() => setSelectedLoan(null)}
          onLoanUpdated={(patch) => {
            updateLoan(selectedLoan.loanId, patch)
            setSelectedLoan((current) => ({ ...current, ...patch }))
          }}
        />
      )}
    </AppShell>
  )
}

function Metric({ label, value, icon }) {
  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

function CustomerLoanCard({ loan, onRepay, onView }) {
  const balance = Number(loan.balance || 0)
  const total = Number(loan.totalAmount || 0)
  const repayment = Number(loan.repayment || 0)
  const progress = total > 0 ? Math.min(100, Math.max(0, (repayment / total) * 100)) : 0

  return (
    <article className="loan-row">
      <div className="loan-main">
        <div className="loan-id">
          <span className="loan-icon">₦</span>
          <div>
            <strong>{money(loan.loanAmount)}</strong>
            <small>Loan #{String(loan.loanId).slice(-8).toUpperCase()}</small>
          </div>
        </div>
        <Badge value={loan.status} />
      </div>

      <div className="loan-progress">
        <div className="progress-label">
          <span>Repayment progress</span>
          <strong>{progress.toFixed(0)}%</strong>
        </div>
        <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
      </div>

      <div className="loan-summary">
        <div><span>Total due</span><strong>{money(total)}</strong></div>
        <div><span>Paid</span><strong>{money(repayment)}</strong></div>
        <div><span>Balance</span><strong>{money(balance)}</strong></div>
        <div><span>Tenor</span><strong>{loan.tenor} months</strong></div>
      </div>

      <div className="loan-actions">
        <button className="secondary-button" onClick={onView}>View details</button>
        {loan.status === 'approved' && balance > 0 && (
          <button className="primary-button" onClick={onRepay}>Make repayment</button>
        )}
      </div>
    </article>
  )
}

function LoanModal({ onClose, onCreated }) {
  const [amount, setAmount] = useState('')
  const [tenor, setTenor] = useState('3')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const numericAmount = Number(amount || 0)
  const rate = Number(tenor) <= 3 ? 3 : Number(tenor) <= 6 ? 6 : Number(tenor) <= 9 ? 10 : 12
  const interest = numericAmount > 0 ? (numericAmount * rate) / 100 : 0
  const total = numericAmount + interest
  const installment = Number(tenor) > 0 ? total / Number(tenor) : 0

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      const response = await api('/api/v1/loan', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          loanAmount: numericAmount,
          tenor: Number(tenor),
        }),
      })
      const loan = response?.data?.result
      if (!loan) throw new Error('The server returned an invalid loan application.')
      onCreated(loan)
      onClose()
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Apply for a loan" subtitle="Choose an amount and repayment term." onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field
          name="amount"
          label="Loan amount (₦)"
          type="number"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          min="0.01"
          step="0.01"
          placeholder="e.g. 150000"
        />

        <label className="field">
          <span>Repayment term</span>
          <select value={tenor} onChange={(event) => setTenor(event.target.value)}>
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={index + 1}>{index + 1} month{index ? 's' : ''}</option>
            ))}
          </select>
        </label>

        <div className="loan-quote">
          <div><span>Interest rate</span><strong>{rate}%</strong></div>
          <div><span>Interest</span><strong>{money(interest)}</strong></div>
          <div><span>Total repayment</span><strong>{money(total)}</strong></div>
          <div><span>Approx. monthly</span><strong>{money(installment)}</strong></div>
        </div>

        {error && <Alert type="error">{error}</Alert>}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={busy || numericAmount <= 0}>
            {busy ? 'Submitting…' : 'Submit application'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function LoanDetailsModal({ loan, onClose, onLoanUpdated }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api(`/api/v1/loan/${loan.loanId}/payment-history`)
      setHistory(response?.data?.result || [])
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [loan.loanId])

  useEffect(() => { loadHistory() }, [loadHistory])

  const [repaymentOpen, setRepaymentOpen] = useState(false)

  return (
    <>
      <Modal title="Loan details" subtitle={`Loan #${String(loan.loanId).slice(-8).toUpperCase()}`} onClose={onClose}>
        <div className="detail-hero">
          <div>
            <span>Outstanding balance</span>
            <strong>{money(loan.balance)}</strong>
          </div>
          <Badge value={loan.status} />
        </div>

        <div className="details-grid">
          <Detail label="Amount borrowed" value={money(loan.loanAmount)} />
          <Detail label="Total repayment" value={money(loan.totalAmount)} />
          <Detail label="Amount repaid" value={money(loan.repayment)} />
          <Detail label="Interest" value={money(loan.interest)} />
          <Detail label="Interest rate" value={`${loan.interestRate}%`} />
          <Detail label="Tenor" value={`${loan.tenor} months`} />
          <Detail label="Installment" value={money(loan.paymentInstallment)} />
          <Detail label="Status" value={<Badge value={loan.status} />} />
        </div>

        {error && <Alert type="error">{error}</Alert>}

        <div className="history-heading">
          <div><h3>Payment history</h3><span>Recent repayments recorded against this loan.</span></div>
          {loan.status === 'approved' && Number(loan.balance) > 0 && (
            <button className="primary-button" onClick={() => setRepaymentOpen(true)}>Make repayment</button>
          )}
        </div>

        {loading ? (
          <p className="muted">Loading payment history…</p>
        ) : history.length === 0 ? (
          <EmptyState compact icon="◷" title="No repayments yet" text="Your repayment transactions will appear here." />
        ) : (
          <div className="history-list">
            {history.map((item) => (
              <div className="history-row" key={item.repaymentId}>
                <div className="history-icon">✓</div>
                <div><strong>{money(item.amount)}</strong><span>{dateTime(item.date)}</span></div>
                <small>{item.recordedBy || 'Quick Credit'}</small>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {repaymentOpen && (
        <RepaymentModal
          loan={loan}
          onClose={() => setRepaymentOpen(false)}
          onDone={(patch) => {
            onLoanUpdated(patch)
            setRepaymentOpen(false)
            loadHistory()
          }}
        />
      )}
    </>
  )
}

function RepaymentModal({ loan, onClose, onDone }) {
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await api(`/api/v1/loan/${loan.loanId}/repayment`, {
        method: 'PATCH',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ loanRepayment: Number(amount) }),
      })
      const update = response?.data?.result?.loanUpdate
      if (update) {
        onDone({
          status: update.status,
          balance: update.balance,
          repayment: Math.max(0, Number(loan.totalAmount) - Number(update.balance)),
        })
      } else {
        onDone({})
      }
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Make a repayment" subtitle={`Outstanding balance: ${money(loan.balance)}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field
          name="loanRepayment"
          label="Repayment amount (₦)"
          type="number"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          min="0.01"
          max={loan.balance}
          step="0.01"
          placeholder={`Up to ${money(loan.balance)}`}
        />
        {error && <Alert type="error">{error}</Alert>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={busy || Number(amount) <= 0}>
            {busy ? 'Processing…' : 'Confirm repayment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function AdminDashboard({ user, onLogout }) {
  const [loans, setLoans] = useState([])
  const [tab, setTab] = useState('all')
  const [page, setPage] = useState('overview')
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [repaidLoans, setRepaidLoans] = useState([])
  const [repaymentLoading, setRepaymentLoading] = useState(false)

  const loadLoans = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const response = await api('/api/v1/admin/loans')
      setLoans(response?.data?.result || [])
    } catch (requestError) {
      if (requestError.status === 404) setLoans([])
      else setError(errorMessage(requestError))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const loadRepayments = useCallback(async () => {
    setRepaymentLoading(true)
    setError('')
    try {
      const [currentResponse, repaidResponse] = await Promise.allSettled([
        api('/api/v1/admin/loans'),
        api('/api/v1/admin/repaid/loans'),
      ])

      if (currentResponse.status === 'fulfilled') {
        setLoans(currentResponse.value?.data?.result || [])
      }
      if (repaidResponse.status === 'fulfilled') {
        setRepaidLoans(repaidResponse.value?.data?.result || [])
      } else if (repaidResponse.reason?.status === 404) {
        setRepaidLoans([])
      } else {
        throw repaidResponse.reason
      }
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setRepaymentLoading(false)
    }
  }, [])

  useEffect(() => { loadLoans() }, [loadLoans])

  useEffect(() => {
    if (page === 'repayments') loadRepayments()
  }, [page, loadRepayments])

  const filtered = useMemo(
    () => (tab === 'all' ? loans : loans.filter((loan) => loan.status === tab)),
    [loans, tab],
  )

  const counts = {
    all: loans.length,
    pending: loans.filter((loan) => loan.status === 'pending').length,
    approved: loans.filter((loan) => loan.status === 'approved').length,
    rejected: loans.filter((loan) => loan.status === 'rejected').length,
    completed: loans.filter((loan) => loan.status === 'completed').length,
  }

  const activeRepayments = loans.filter((loan) => loan.status === 'approved' && Number(loan.balance) > 0)

  const updateLoan = (loanId, patch) => {
    setLoans((current) => current.map((loan) => (
      String(loan.loanId) === String(loanId) ? { ...loan, ...patch } : loan
    )))
  }

  const notify = (text) => {
    setNotice(text)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const openLoan = (loan) => setSelected(loan)

  return (
    <AppShell
      user={user}
      onLogout={onLogout}
      admin
      activeNav={page}
      onNavigate={setPage}
    >
      <main className="content">
        <section className="welcome-row">
          <div>
            <div className="eyebrow">Operations workspace</div>
            <h1>{page === 'repayments' ? 'Repayments and collections.' : page === 'loans' ? 'Loan applications.' : 'Loan operations, at a glance.'}</h1>
            <p>{page === 'repayments' ? 'Monitor outstanding balances and completed repayments.' : page === 'loans' ? 'Review, verify and manage every loan application.' : 'Review applications, manage approvals and monitor repayments.'}</p>
          </div>
          <button
            className="secondary-button"
            onClick={() => page === 'repayments' ? loadRepayments() : loadLoans(true)}
            disabled={refreshing || repaymentLoading}
          >
            {(refreshing || repaymentLoading) ? 'Refreshing…' : '↻ Refresh data'}
          </button>
        </section>

        {error && <Alert type="error">{error}</Alert>}
        {notice && <Alert type="success">{notice}</Alert>}

        {page === 'repayments' ? (
          <RepaymentsPanel
            activeLoans={activeRepayments}
            repaidLoans={repaidLoans}
            loading={repaymentLoading}
            onManage={openLoan}
          />
        ) : (
          <>
            <section className="metrics-grid">
              <Metric label="All applications" value={counts.all} icon="▣" />
              <Metric label="Pending review" value={counts.pending} icon="◷" />
              <Metric label="Approved" value={counts.approved} icon="✓" />
              <Metric label="Completed" value={counts.completed} icon="↗" />
            </section>

            {page === 'overview' && (
              <section className="panel">
                <PanelHeader
                  title="Recent loan applications"
                  subtitle="Use Loan applications in the sidebar for the complete management view."
                  action={<button className="secondary-button" onClick={() => setPage('loans')}>Open applications</button>}
                />
                {loading ? <TableSkeleton /> : loans.length === 0 ? (
                  <EmptyState icon="▣" title="No applications found" text="There are no loans available right now." />
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Customer</th><th>Loan</th><th>Status</th><th>Balance</th><th>Action</th></tr></thead>
                      <tbody>
                        {loans.slice(0, 5).map((loan) => (
                          <tr key={String(loan.loanId)}>
                            <td><div className="customer-cell"><div className="mini-avatar">{loan.firstName?.[0]?.toUpperCase() || '?'}</div><div><strong>{loan.firstName}</strong><span>{loan.email}</span></div></div></td>
                            <td><strong>{money(loan.totalAmount)}</strong><span className="table-sub">#{String(loan.loanId).slice(-8).toUpperCase()}</span></td>
                            <td><Badge value={loan.status} /></td>
                            <td><strong>{money(loan.balance)}</strong></td>
                            <td><button className="small-button" onClick={() => openLoan(loan)}>Manage</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {page === 'loans' && (
              <section className="panel">
                <PanelHeader title="Loan applications" subtitle="Review every loan returned by the Quick Credit API." />
                <div className="filter-tabs">
                  {Object.keys(counts).map((status) => (
                    <button key={status} className={tab === status ? 'active' : ''} onClick={() => setTab(status)}>
                      {status === 'all' ? 'All' : status[0].toUpperCase() + status.slice(1)}
                      <span>{counts[status]}</span>
                    </button>
                  ))}
                </div>
                {loading ? <TableSkeleton /> : filtered.length === 0 ? (
                  <EmptyState icon="▣" title="No applications found" text="There are no loans in this view right now." />
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Customer</th><th>Loan</th><th>Status</th><th>Total due</th><th>Balance</th><th>Action</th></tr></thead>
                      <tbody>
                        {filtered.map((loan) => (
                          <tr key={String(loan.loanId)}>
                            <td><div className="customer-cell"><div className="mini-avatar">{loan.firstName?.[0]?.toUpperCase() || '?'}</div><div><strong>{loan.firstName}</strong><span>{loan.email}</span></div></div></td>
                            <td><strong>{money(loan.totalAmount)}</strong><span className="table-sub">#{String(loan.loanId).slice(-8).toUpperCase()}</span></td>
                            <td><Badge value={loan.status} /></td>
                            <td>{money(loan.totalAmount)}</td>
                            <td><strong>{money(loan.balance)}</strong></td>
                            <td><button className="small-button" onClick={() => openLoan(loan)}>Manage</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {selected && (
        <AdminLoanModal
          loanId={selected.loanId}
          userId={selected.userId}
          onClose={() => setSelected(null)}
          onChanged={(patch, message) => {
            updateLoan(selected.loanId, patch)
            if (message) notify(message)
            loadLoans(true)
            if (page === 'repayments') loadRepayments()
          }}
        />
      )}
    </AppShell>
  )
}

function RepaymentsPanel({ activeLoans, repaidLoans, loading, onManage }) {
  if (loading) return <section className="panel"><PanelHeader title="Repayments" subtitle="Loading repayment records…" /><TableSkeleton /></section>

  return (
    <>
      <section className="metrics-grid">
        <Metric label="Outstanding loans" value={activeLoans.length} icon="◷" />
        <Metric label="Outstanding balance" value={money(activeLoans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0))} icon="₦" />
        <Metric label="Completed repayments" value={repaidLoans.length} icon="✓" />
        <Metric label="Repaid endpoint" value="Connected" icon="↗" />
      </section>

      <section className="panel">
        <PanelHeader title="Outstanding repayments" subtitle="Approved loans that still have a balance." />
        {activeLoans.length === 0 ? (
          <EmptyState icon="✓" title="No outstanding repayments" text="There are no approved loans with an outstanding balance." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Customer</th><th>Loan</th><th>Status</th><th>Balance</th><th>Action</th></tr></thead>
              <tbody>
                {activeLoans.map((loan) => (
                  <tr key={String(loan.loanId)}>
                    <td><div className="customer-cell"><div className="mini-avatar">{loan.firstName?.[0]?.toUpperCase() || '?'}</div><div><strong>{loan.firstName}</strong><span>{loan.email}</span></div></div></td>
                    <td><strong>{money(loan.totalAmount)}</strong><span className="table-sub">#{String(loan.loanId).slice(-8).toUpperCase()}</span></td>
                    <td><Badge value={loan.status} /></td>
                    <td><strong>{money(loan.balance)}</strong></td>
                    <td><button className="small-button" onClick={() => onManage(loan)}>Manage repayment</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <PanelHeader title="Completed repayments" subtitle="Records returned by the Quick Credit repaid-loans endpoint." />
        {repaidLoans.length === 0 ? (
          <EmptyState compact icon="✓" title="No completed repayments" text="The backend has not returned any completed loans yet." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Loan</th><th>Status</th><th>Balance</th></tr></thead>
              <tbody>{repaidLoans.map((loan) => <tr key={String(loan.loanId)}><td><strong>#{String(loan.loanId).slice(-8).toUpperCase()}</strong></td><td><Badge value={loan.status} /></td><td>{money(Number(loan.balance || 0) / 100)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function AdminLoanModal({ loanId, userId, onClose, onChanged }) {
  const [loan, setLoan] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [repayment, setRepayment] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const response = await api(`/api/v1/admin/${loanId}/loan`)
      setLoan(response?.data?.result || null)
    } catch (requestError) {
      setError(errorMessage(requestError))
    }
  }, [loanId])

  useEffect(() => { load() }, [load])

  const verifyCustomer = async () => {
    if (!userId) {
      setError('Customer ID is missing from the loan record. Refresh the loan applications and try again.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await api(`/api/v1/admin/${userId}/verify-user`, { method: 'PATCH' })
      const verifiedStatus = response?.data?.result?.status || 'verified'
      setLoan((current) => current ? { ...current, userStatus: verifiedStatus } : current)
      onChanged({}, 'Customer verified successfully.')
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = async (status) => {
    setBusy(true)
    setError('')
    try {
      await api(`/api/v1/admin/${loanId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await load()
      onChanged({ status }, `Loan ${status} successfully.`)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  const postRepayment = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await api(`/api/v1/admin/${loanId}/postrepayment`, {
        method: 'PATCH',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ loanRepayment: Number(repayment) }),
      })
      const result = response?.data?.result
      const updatedBalance = Number(result?.loan?.balance || 0) / 100
      await load()
      onChanged({ balance: updatedBalance }, 'Repayment posted successfully.')
      setRepayment('')
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Loan management" subtitle={`Loan #${String(loanId).slice(-8).toUpperCase()}`} onClose={onClose}>
      {error && <Alert type="error">{error}</Alert>}
      {!loan ? (
        <ListSkeleton />
      ) : (
        <>
          <div className="admin-loan-head">
            <div>
              <span>Outstanding balance</span>
              <strong>{money(loan.balance)}</strong>
            </div>
            <Badge value={loan.loanStatus} />
          </div>

          <div className="details-grid">
            <Detail label="Customer" value={loan.firstName} />
            <Detail label="Email" value={loan.email} />
            <Detail label="User status" value={<Badge value={loan.userStatus} />} />
            <Detail label="Loan status" value={<Badge value={loan.loanStatus} />} />
            <Detail label="Total repayment" value={money(loan.totalAmount)} />
            <Detail label="Amount repaid" value={money(loan.repay)} />
          </div>

          {String(loan.userStatus).toLowerCase() !== 'verified' && (
            <div className="admin-actions">
              <button className="primary-button" disabled={busy} onClick={verifyCustomer}>
                {busy ? 'Verifying…' : 'Verify customer'}
              </button>
            </div>
          )}

          {loan.loanStatus === 'pending' && (
            <div className="admin-actions">
              <button className="secondary-button" disabled={busy} onClick={() => changeStatus('rejected')}>Reject application</button>
              <button className="primary-button" disabled={busy} onClick={() => changeStatus('approved')}>Approve application</button>
            </div>
          )}

          {loan.loanStatus === 'approved' && Number(loan.balance) > 0 && (
            <form className="form admin-repayment" onSubmit={postRepayment}>
              <div className="eyebrow">Record repayment</div>
              <Field
                name="installment"
                label="Amount received (₦)"
                type="number"
                value={repayment}
                onChange={(event) => setRepayment(event.target.value)}
                min="0.01"
                max={loan.balance}
                step="0.01"
              />
              <button className="primary-button" disabled={busy || Number(repayment) <= 0}>
                {busy ? 'Processing…' : 'Post repayment'}
              </button>
            </form>
          )}
        </>
      )}
    </Modal>
  )
}

function PanelHeader({ title, subtitle, action }) {
  return (
    <div className="panel-header">
      <div><h2>{title}</h2><p>{subtitle}</p></div>
      {action}
    </div>
  )
}

function Detail({ label, value }) {
  return <div className="detail"><span>{label}</span><strong>{value}</strong></div>
}

function Badge({ value }) {
  const normalized = String(value || 'unknown').toLowerCase()
  return <span className={`badge ${normalized}`}>{String(value || 'Unknown')}</span>
}

function Alert({ children, type = 'error' }) {
  return <div className={`alert ${type}`} role="status">{children}</div>
}

function EmptyState({ icon, title, text, action, compact = false }) {
  return (
    <div className={`empty-state ${compact ? 'compact' : ''}`}>
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}

function ListSkeleton() {
  return <div className="skeleton-list">{[1, 2, 3].map((x) => <div className="skeleton-row" key={x}><i /><span /><b /></div>)}</div>
}

function TableSkeleton() {
  return <div className="skeleton-table">{[1, 2, 3, 4].map((x) => <div className="skeleton-table-row" key={x}><i /><i /><i /><i /></div>)}</div>
}

function Modal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="close-button" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
