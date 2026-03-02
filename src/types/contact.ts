export type IdentifyRequest = {
  email?: string | null;
  phoneNumber?: string | null;
};

export type IdentifyResponse = {
  contact: {
    primaryContatctId: number;
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
  };
};
