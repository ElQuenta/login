import axios from 'axios'

export interface User {
  _id: string
  name: string
  email: string
  createdAt: string
  updatedAt: string
}

export const TOKEN_KEY = 'auth.token'
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 10000,
})

export async function login(email: string, password: string) {
  const { data } = await api.post<{ token: string; user: User }>('/auth/login', { email, password })
  if (typeof data.token !== 'string' || !data.token) throw new Error('Respuesta de autenticación inválida.')
  const response = await api.get<{ user: User }>('/auth/me', {
    headers: { Authorization: `Bearer ${data.token}` },
  })
  if (!response.data.user?.name || !response.data.user?.email) throw new Error('Respuesta de usuario inválida.')
  return { token: data.token, user: response.data.user }
}

export function loginErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.'
    if (error.response.status === 401) return 'El correo o la contraseña son incorrectos.'
    if (error.response.status === 400) return 'Revisa el correo y la contraseña e inténtalo de nuevo.'
    if (error.response.status === 429) return 'Demasiados intentos. Espera un momento antes de volver a intentar.'
  }
  return 'No se pudo completar el inicio de sesión. Inténtalo de nuevo más tarde.'
}
