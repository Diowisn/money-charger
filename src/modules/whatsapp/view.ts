export function responsWebhook(status: number, body: string) {
  return new Response(body, { status });
}
