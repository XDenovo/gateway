import { createGatewayClient } from '@xdenovo/gateway-client'

const gateway = createGatewayClient({
  baseUrl: 'https://api.example.test'
})

document.body.dataset.healthPath = gateway.health.$path()
document.body.dataset.mePath = gateway.v1.me.$path()
