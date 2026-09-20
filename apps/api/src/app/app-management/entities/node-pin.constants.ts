export const HOSTNAME_LABEL_KEY = 'kubernetes.io/hostname'

export const MAX_NODE_PIN_VALUES = 32

// K8s label key: optional DNS-subdomain prefix, then a <=63-char name.
export const NODE_LABEL_KEY_PATTERN =
  /^([a-z0-9]([-a-z0-9.]*[a-z0-9])?\/)?[A-Za-z0-9]([-A-Za-z0-9_.]{0,61}[A-Za-z0-9])?$/

export const NODE_LABEL_VALUE_PATTERN = /^[A-Za-z0-9]([-A-Za-z0-9_.]{0,61}[A-Za-z0-9])?$/
