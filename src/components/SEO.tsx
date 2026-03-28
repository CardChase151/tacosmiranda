import { Helmet } from 'react-helmet-async'

const BASE_URL = 'https://tacosmiranda.com'

export default function SEO() {
  const title = 'Tacos Miranda | Authentic Mexican Food | Huntington Beach, CA'
  const description = 'Authentic Mexican food in Huntington Beach. White corn tortillas, cooked in beef tallow. Tacos, burritos, tortas, quesabirria and more. Open 7 days, 7AM-9PM. Call (657) 845-4011 to order ahead.'

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={BASE_URL} />

      <meta property="og:type" content="restaurant" />
      <meta property="og:url" content={BASE_URL} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={`${BASE_URL}/og-image.png`} />
      <meta property="og:site_name" content="Tacos Miranda" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={`${BASE_URL}/og-image.png`} />
    </Helmet>
  )
}
