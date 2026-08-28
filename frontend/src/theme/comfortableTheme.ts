import { defineTheme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral'

/**
 * ETFolio's comfortable density raises the baseline for the whole app rather
 * than relying on one-off padding adjustments in each page.
 */
export const comfortableTheme = defineTheme({
  name: 'etfolio-comfortable',
  extends: neutralTheme,
  typography: {
    scale: { base: 16, ratio: 1.2 }
  },
  components: {
    card: {
      base: { padding: '24px' }
    },
    button: {
      base: { minHeight: '44px', padding: '0 16px' }
    },
    'icon-button': {
      base: { minWidth: '44px', minHeight: '44px' }
    },
    'text-input': {
      base: { minHeight: '44px' }
    },
    selector: {
      base: { minHeight: '44px' }
    },
    toolbar: {
      base: { minHeight: '56px' }
    },
    'top-nav': {
      base: {
        width: 'calc(100% - 64px)',
        maxWidth: '1440px',
        margin: '0 auto',
        paddingInline: '0'
      }
    }
  }
})
