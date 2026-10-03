import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { RouteError, NotFound } from './RouteError'
import { RequireManager, RequireStaff } from './guards'

type LazyModule = { default: React.ComponentType }
const page = (load: () => Promise<LazyModule>): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ Component: (await load()).default }),
})

const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      { path: '/', ...page(() => import('@/features/public/HomePage')) },
      { path: '/r/:slug', ...page(() => import('@/features/public/RestaurantPage')) },
      { path: '/r/:slug/menu', ...page(() => import('@/features/public/PublicMenuPage')) },
      { path: '/r/:slug/table/:tableId', ...page(() => import('@/features/guest/TableEntryPage')) },
      {
        path: '/session/:sessionId',
        ...page(() => import('@/features/guest/GuestSessionLayout')),
        children: [
          { index: true, ...page(() => import('@/features/guest/MenuOrderPage')) },
          { path: 'order', ...page(() => import('@/features/guest/CartPage')) },
          { path: 'orders', ...page(() => import('@/features/guest/OrdersPage')) },
          { path: 'bill', ...page(() => import('@/features/guest/BillPage')) },
          { path: 'review', ...page(() => import('@/features/guest/ReviewPage')) },
        ],
      },
      { path: '/login', ...page(() => import('@/features/auth/LoginPage')) },
      { path: '/signup', ...page(() => import('@/features/auth/SignupPage')) },
      { path: '/onboarding', ...page(() => import('@/features/auth/OnboardingPage')) },
      {
        path: '/staff',
        element: <RequireStaff />,
        children: [
          {
            ...page(() => import('@/features/staff/StaffLayout')),
            children: [
              { index: true, element: <Navigate to="orders" replace /> },
              { path: 'orders', ...page(() => import('@/features/staff/KitchenPage')) },
              { path: 'tables', ...page(() => import('@/features/staff/TablesPage')) },
              { path: 'menu', ...page(() => import('@/features/staff/AvailabilityPage')) },
            ],
          },
        ],
      },
      {
        path: '/admin',
        element: <RequireManager />,
        children: [
          {
            ...page(() => import('@/features/admin/AdminLayout')),
            children: [
              { index: true, ...page(() => import('@/features/admin/DashboardPage')) },
              { path: 'restaurant', ...page(() => import('@/features/admin/RestaurantSettingsPage')) },
              { path: 'menu', ...page(() => import('@/features/admin/MenuManagerPage')) },
              { path: 'tables', ...page(() => import('@/features/admin/TablesManagerPage')) },
              { path: 'staff', ...page(() => import('@/features/admin/StaffManagerPage')) },
              { path: 'orders', ...page(() => import('@/features/admin/OrdersPage')) },
              { path: 'reviews', ...page(() => import('@/features/admin/ReviewsPage')) },
              { path: 'analytics', ...page(() => import('@/features/admin/AnalyticsPage')) },
            ],
          },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
