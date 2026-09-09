function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`
    );
  }
  return value;
}

export const env = {
  get zohoAccountsUrl() {
    return required("ZOHO_ACCOUNTS_URL");
  },
  get zohoApiDomain() {
    return required("ZOHO_API_DOMAIN");
  },
  get zohoClientId() {
    return required("ZOHO_CLIENT_ID");
  },
  get zohoClientSecret() {
    return required("ZOHO_CLIENT_SECRET");
  },
  get zohoRefreshToken() {
    return required("ZOHO_REFRESH_TOKEN");
  },
  get zohoApiVersion() {
    return process.env.ZOHO_API_VERSION || "v6";
  },
  get contractModuleApiName() {
    return process.env.ZOHO_CONTRACT_MODULE_API_NAME || "Vertraege";
  },
};
