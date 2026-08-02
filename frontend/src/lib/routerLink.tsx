import React from 'react'
import { Link as RouterLink, LinkProps as RouterLinkProps } from 'react-router-dom'

// Adapts Astryx's `href` prop to react-router's `to`, so every Astryx
// Link/TopNavItem/etc. navigates client-side instead of full-page reloading.
export const RouterLinkAdapter = React.forwardRef<HTMLAnchorElement, { href?: string } & Omit<RouterLinkProps, 'to'>>(
  ({ href, ...rest }, ref) => <RouterLink ref={ref} to={href || '#'} {...rest} />
)
RouterLinkAdapter.displayName = 'RouterLinkAdapter'

// For links that must stay a real <a> (external URLs, file downloads) even
// though LinkProvider defaults every Astryx Link to client-side routing.
export const PlainAnchor = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement>>(
  (props, ref) => <a ref={ref} {...props} />
)
PlainAnchor.displayName = 'PlainAnchor'
