import type { Handler } from '@netlify/functions'

const handler: Handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      title: 'star_cloudprnt_server_setting',
      version: '1.0.0',
      serverSupportProtocol: ['HTTP', 'HTTPS'],
    }),
  }
}

export { handler }
