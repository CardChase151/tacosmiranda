import { Helmet } from 'react-helmet-async'
import { useLocation } from 'react-router-dom'

const BASE_URL = 'https://tacosmiranda.com'

type RouteMeta = {
  title: string
  description: string
  path: string
  noindex?: boolean
}

const DEFAULT_DESCRIPTION = 'Authentic Mexican food in Huntington Beach. Tacos, burritos, tortas, quesabirria and more. Open 7 days, 7AM-9PM. Call (657) 845-4011 or order online.'

const ROUTE_META: Record<string, RouteMeta> = {
  '/': {
    title: 'Tacos Miranda | Authentic Mexican Food | Huntington Beach, CA',
    description: DEFAULT_DESCRIPTION,
    path: '/',
  },
  '/order': {
    title: 'Order Online | Tacos Miranda | Huntington Beach Mexican Food',
    description: 'Order Tacos Miranda online for pickup. Tacos, burritos, quesabirria, tortas, breakfast and more. Huntington Beach, CA.',
    path: '/order',
  },
  '/my-orders': {
    title: 'My Orders | Tacos Miranda',
    description: 'Your order history at Tacos Miranda.',
    path: '/my-orders',
    noindex: true,
  },
  '/screen': {
    title: 'Tacos Miranda',
    description: DEFAULT_DESCRIPTION,
    path: '/screen',
    noindex: true,
  },
  '/admin/dashboard': {
    title: 'Admin Dashboard | Tacos Miranda',
    description: 'Internal admin dashboard.',
    path: '/admin/dashboard',
    noindex: true,
  },
  '/admin/analytics': {
    title: 'Analytics | Tacos Miranda',
    description: 'Internal analytics dashboard.',
    path: '/admin/analytics',
    noindex: true,
  },
  '/admin/menu-data': {
    title: 'Menu Data | Tacos Miranda',
    description: 'Internal menu management.',
    path: '/admin/menu-data',
    noindex: true,
  },
  '/admin/billing': {
    title: 'Billing | Tacos Miranda',
    description: 'Internal billing settings.',
    path: '/admin/billing',
    noindex: true,
  },
  '/admin/print-menu': {
    title: 'Print Menu | Tacos Miranda',
    description: 'Print-friendly menu view.',
    path: '/admin/print-menu',
    noindex: true,
  },
}

export default function SEO() {
  const location = useLocation()
  const meta = ROUTE_META[location.pathname] || {
    title: 'Tacos Miranda | Authentic Mexican Food | Huntington Beach, CA',
    description: DEFAULT_DESCRIPTION,
    path: location.pathname,
    noindex: true,
  }
  const url = `${BASE_URL}${meta.path}`
  const ogImage = `${BASE_URL}/og-image.png`

  return (
    <Helmet>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={url} />
      {meta.noindex
        ? <meta name="robots" content="noindex, nofollow" />
        : <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
      }

      <meta property="og:type" content="restaurant" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content="Tacos Miranda" />
      <meta property="og:locale" content="en_US" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  )
}
