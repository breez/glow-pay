import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { WalletProvider } from './lib/wallet/WalletContext'
import { LandingPage } from './pages/LandingPage'
import { SetupWizard } from './pages/SetupWizard'
import { CheckoutPage } from './pages/CheckoutPage'
import { DashboardLayout } from './pages/dashboard/DashboardLayout'
import { DashboardHome } from './pages/dashboard/DashboardHome'
import { DashboardPayments } from './pages/dashboard/DashboardPayments'
import { DashboardSettings } from './pages/dashboard/DashboardSettings'
import { DashboardCreatePayment } from './pages/dashboard/DashboardCreatePayment'

function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Routes>
          {/* Public pages */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/setup" element={<SetupWizard />} />
          <Route path="/pay/:merchantId/:paymentId" element={<CheckoutPage />} />
          
          {/* Merchant dashboard */}
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardHome />} />
            <Route path="payments" element={<DashboardPayments />} />
            <Route path="payments/new" element={<DashboardCreatePayment />} />
            <Route path="settings" element={<DashboardSettings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  )
}

export default App
