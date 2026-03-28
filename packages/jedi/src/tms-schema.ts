export interface TmsOutputSchema {
  required: string[];
  optional: string[];
  noExtraFields: boolean;
}

export const defaultTmsSchema: TmsOutputSchema = {
  required: [
    'referenceNumber',
    'carrier.scac',
    'stops',
  ],
  optional: [
    'carrier.name',
    'shipper.name',
    'shipper.address',
    'consignee.name',
    'consignee.address',
    'equipmentType',
    'weight',
    'weightUnit',
    'paymentMethod',
    'notes',
  ],
  noExtraFields: false,
};
