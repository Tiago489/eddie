export interface IsaEnvelope {
  authInfoQualifier: string;
  authInfo: string;
  securityInfoQualifier: string;
  securityInfo: string;
  senderIdQualifier: string;
  senderId: string;
  receiverIdQualifier: string;
  receiverId: string;
  date: string;
  time: string;
  repetitionSeparator: string;
  controlVersionNumber: string;
  controlNumber: string;
  ackRequested: string;
  usageIndicator: string;
  componentSeparator: string;
  elementSeparator: string;
  segmentTerminator: string;
}

export function parseIsa(raw: string): IsaEnvelope | null {
  if (raw.length < 106 || !raw.startsWith('ISA')) {
    return null;
  }

  const elementSeparator = raw[3];
  const elements = raw.substring(0, 106).split(elementSeparator);

  if (elements.length < 17) {
    return null;
  }

  // The 16th element contains the component separator followed by the segment terminator
  const lastElement = elements[16];
  const componentSeparator = lastElement[0];
  const segmentTerminator = lastElement[1];

  return {
    authInfoQualifier: elements[1],
    authInfo: elements[2],
    securityInfoQualifier: elements[3],
    securityInfo: elements[4],
    senderIdQualifier: elements[5],
    senderId: elements[6].trim(),
    receiverIdQualifier: elements[7],
    receiverId: elements[8].trim(),
    date: elements[9],
    time: elements[10],
    repetitionSeparator: elements[11],
    controlVersionNumber: elements[12],
    controlNumber: elements[13],
    ackRequested: elements[14],
    usageIndicator: elements[15],
    componentSeparator,
    elementSeparator,
    segmentTerminator,
  };
}
