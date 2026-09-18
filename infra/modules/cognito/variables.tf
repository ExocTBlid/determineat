variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "callback_urls" {
  description = "Allowed OAuth callback URLs for the app client"
  type        = list(string)
}

variable "logout_urls" {
  description = "Allowed sign-out URLs for the app client"
  type        = list(string)
}
