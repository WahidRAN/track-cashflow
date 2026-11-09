export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()
  if (!user.value && !to.path.startsWith('/auth')) {
    return navigateTo('/auth/login')
  }
})
