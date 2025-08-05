import { createRouter, createWebHistory } from 'vue-router'
import { getCurrentUser } from '@/api/user.js'
import { appSettings } from '@/stores/settings'

const routes = [
  {
    path: '/',
    name: 'Landing',
    component: () => import('@/views/Landing/LandingPage.vue'),
    meta: {
      layout: 'public',
      title: 'Home',
      description: 'Discover Startups with Startnet.'
    }
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard/DashboardPage.vue'),
    meta: {
      layout: 'default',
      requiresAuth: true,
      title: 'Dashboard',
      description: 'Manage your activity and Startups.'
    }
  },
 {
  path: '/notifications',
  name: 'Notifications',
  component: () => import('@/views/Header/Notifications.vue'),
  meta: { layout: 'default',title: 'Notifications' }
},
{
  path: '/notifications/:id',
  name: 'NotificationDetail',
  component: () => import('@/views/Header/NotificationDetailView.vue'),
  meta: { layout: 'default',title: 'Notifications' }
},
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/Header/Settings.vue'),
    meta: {
      layout: 'default',
      requiresAuth: true,
      title: 'App Settings',
      description: 'Manage global settings.'
    }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Auth/LoginPage.vue'),
    meta: {
      layout: 'public',
      title: 'Login',
      description: 'Login to your account.'
    }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/Auth/RegisterPage.vue'),
    meta: {
      layout: 'public',
      title: 'Register',
      description: 'Create a new account.'
    }
  },
  {
    path: '/forgot-password',
    name: 'ForgotPassword',
    component: () => import('@/views/Auth/ForgotPasswordPage.vue'),
    meta: {
      layout: 'public',
      title: 'Forgot Password',
      description: 'Reset your password securely.'
    }
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: () => import('@/views/Auth/ResetPasswordPage.vue'),
    meta: {
      layout: 'public',
      title: 'Reset Password',
      description: 'Choose a new password for your account.'
    }
  },
  {
    path: '/verify-email',
    name: 'VerifyEmail',
    component: () => import('@/views/Auth/VerifyEmailPage.vue'),
    meta: {
      layout: 'public',
      title: 'Verify Email',
      description: 'Verifying your email to activate account.'
    }
  },
  {
    path: '/verify-notice',
    name: 'VerifyNotice',
    component: () => import('@/views/Auth/VerifyNoticePage.vue'),
    meta: {
      layout: 'public',
      title: 'Email Sent',
      description: 'Please verify your email to continue.'
    }
  },
  {
    path: '/resend-verification',
    name: 'ResendVerification',
    component: () => import('@/views/Auth/ResendVerificationPage.vue'),
    meta: {
      layout: 'public',
      title: 'Resend Email',
      description: 'Resend your verification email if not received.'
    }
  },
  {
    path: '/error',
    name: 'ErrorPage',
    component: () => import('@/views/Error/ErrorPage.vue'),
    meta: {
      layout: 'default',
      title: 'Error',
      description: 'Something went wrong.'
    }
  },
  {
    path: '/:catchAll(.*)',
    name: 'NotFound',
    component: () => import('@/views/Error/NotFoundPage.vue'),
    meta: {
      layout: 'default',
      title: 'Not Found',
      description: 'The page you are looking for doesn\'t exist.'
    }
  },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAdmin: true },
    children: [
      {
        path: '',
        name: 'AdminDashboard',
        component: () => import('@/views/Admin/AdminDashboard.vue'),
        meta: { title: 'Admin Dashboard' }
      },
      {
        path: 'users',
        name: 'AdminUsers',
        component: () => import('@/views/Admin/AdminUsers.vue'),
        meta: { title: 'Manage Users' }
      },
      {
        path: '/admin/users/:id',
        name: 'AdminUserDetails',
        component: () => import('@/views/Admin/AdminUserDetails.vue'),
        meta: { layout: 'admin', title: 'User Details' }
      },

{
  path: '/admin/notifications',
  name: 'AdminNotifications',
  component: () => import('@/views/Admin/AdminSendNotifications.vue'),
  meta: { layout: 'admin', title: 'Send Notifications' }
},
      {
        path: 'settings',
        name: 'AdminAppSettings',
        component: () => import('@/views/Admin/AdminSettings.vue'),
        meta: { title: 'App Settings' }
      },
      {
        path: 'logs',
        name: 'AdminLogs',
        component: () => import('@/views/Admin/AdminLogs.vue'),
        meta: { title: 'System Logs' }
      }
      
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

// ✅ Auth Guard — allow only logged-in users to access non-auth pages
router.beforeEach(async (to, from, next) => {
  document.getElementById('app')?.classList.add('page-loading')

  const publicPaths = [
    '/',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/verify-notice',
    '/resend-verification',
    '/error'
  ]

  const isPublic = publicPaths.includes(to.path) || to.name === 'NotFound'

  try {
    const user = await getCurrentUser()
    console.log('🔐 User:', user)

    if (to.path === '/login' || to.path === '/register') {
      return next('/dashboard') // redirect logged-in users away from auth pages
    }

    if (to.meta.requiresAdmin && !user.is_admin) {
      return next('/dashboard')
    }

    next() // ✅ Authenticated and allowed
  } catch {
    // Not logged in
    if (isPublic) {
      return next()
    } else {
      return next('/login') // 🚫 Redirect to login
    }
  }
})

// ✅ SEO Metadata Handler
router.afterEach((to) => {
  document.getElementById('app')?.classList.remove('page-loading')

  const appName = appSettings.app_name || 'StartNet'
  const title = to.meta?.title ? `${to.meta.title} | ${appName}` : appName
  const description = to.meta?.description || 'Discover and offer Startups services.'

  document.title = title

  let descTag = document.querySelector('meta[name="description"]')
  if (descTag) {
    descTag.setAttribute('content', description)
  } else {
    descTag = document.createElement('meta')
    descTag.name = 'description'
    descTag.content = description
    document.head.appendChild(descTag)
  }
})

export default router