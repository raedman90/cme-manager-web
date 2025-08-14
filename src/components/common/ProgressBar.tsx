import { useEffect, useRef } from "react"
import NProgress from "nprogress"
import { useIsFetching, useIsMutating } from "@tanstack/react-query"
import { useLocation } from "react-router-dom"

NProgress.configure({ showSpinner: false })

export default function ProgressBar() {
  const fetching = useIsFetching()
  const mutating = useIsMutating()
  const location = useLocation()
  const prevPath = useRef(location.pathname)

  // Navegação: inicia na troca de rota
  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      NProgress.start()
      prevPath.current = location.pathname
      // conclusão mínima após render
      const id = setTimeout(() => NProgress.done(), 300)
      return () => clearTimeout(id)
    }
  }, [location.pathname])

  // Requests: Query/Mutation em andamento
  useEffect(() => {
    if (fetching > 0 || mutating > 0) NProgress.start()
    else NProgress.done()
  }, [fetching, mutating])

  return null
}