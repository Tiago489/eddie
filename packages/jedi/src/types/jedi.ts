// Segment primitives — reusable across transaction sets

export interface ST_Header {
  ST_01_TransactionSetIdentifierCode: string;
  ST_02_TransactionSetControlNumber: string;
}

export interface SE_Trailer {
  SE_01_NumberOfIncludedSegments: string;
  SE_02_TransactionSetControlNumber: string;
}

export interface N1_Loop {
  name_N1: {
    N1_01_EntityIdentifierCode: string;
    N1_02_Name?: string;
    N1_03_IdentificationCodeQualifier?: string;
    N1_04_IdentificationCode?: string;
  };
  address_information_N3?: {
    N3_01_AddressInformation: string;
    N3_02_AddressInformation?: string;
  };
  geographic_location_N4?: {
    N4_01_CityName?: string;
    N4_02_StateOrProvinceCode?: string;
    N4_03_PostalCode?: string;
  };
}

export interface L11_Reference {
  L11_01_ReferenceIdentification: string;
  L11_02_ReferenceIdentificationQualifier: string;
}

export interface G62_DateTime {
  G62_01_DateQualifier?: string;
  G62_02_Date?: string;
  G62_03_TimeQualifier?: string;
  G62_04_Time?: string;
}

// Jedi204 — Motor Carrier Load Tender

export interface Jedi204 {
  heading: {
    transaction_set_header_ST: ST_Header;
    beginning_segment_for_shipper_order_B2: {
      B2_02_StandardCarrierAlphaCode?: string;
      B2_04_ShipmentIdentificationNumber?: string;
      B2_06_ShipmentMethodOfPayment?: string;
    };
    reference_identification_L11?: L11_Reference[];
    date_time_reference_G62?: G62_DateTime[];
    party_identification_loop_N1?: N1_Loop[];
  };
  detail: {
    stop_off_details_loop_S5: Array<{
      stop_off_details_S5: {
        S5_01_StopSequenceNumber: string;
        S5_02_StopReasonCode: string;
      };
      reference_identification_L11?: L11_Reference[];
      date_time_reference_G62?: G62_DateTime[];
      party_identification_loop_N1?: N1_Loop[];
    }>;
  };
  summary?: {
    transaction_set_trailer_SE: SE_Trailer;
  };
}

// Stedi204 — Motor Carrier Load Tender (Stedi-compatible flat format)

export interface Stedi204StopOff {
  stop_off_details_S5: {
    stop_sequence_number_01: string;
    stop_reason_code_02: string;
    number_of_units_shipped_05?: number;
  };
  business_instructions_and_reference_number_L11?: Array<{
    reference_identification_01: string;
    reference_identification_qualifier_02: string;
  }>;
  date_time_G62?: Array<{
    date_qualifier_01?: string;
    date_02?: string;
    time_qualifier_03?: string;
    time_04?: string;
  }>;
  note_special_instruction_NTE?: {
    description_02?: string;
  };
  description_marks_and_numbers_L5_loop?: Array<{
    description_marks_and_numbers_L5: {
      lading_line_item_number_01?: string;
      lading_description_02?: string;
    };
  }>;
  [key: `name_N1_loop_${string}`]: StediN1Loop | undefined;
}

export interface Stedi204TransactionSet {
  heading: {
    transaction_set_header_ST: {
      transaction_set_identifier_code_01: string;
      transaction_set_control_number_02: string;
    };
    beginning_segment_for_shipment_information_transaction_B2: {
      standard_carrier_alpha_code_02?: string;
      shipment_identification_number_04?: string;
      shipment_method_of_payment_06?: string;
    };
    set_purpose_B2A?: {
      transaction_set_purpose_code_01: string;
    };
    business_instructions_and_reference_number_L11?: Array<{
      reference_identification_01: string;
      reference_identification_qualifier_02: string;
    }>;
    equipment_details_N7_loop?: Array<{
      equipment_details_N7: {
        equipment_type_22?: string;
        weight_03?: number;
      };
    }>;
    [key: `L11 - ${string}`]: { reference_identification_01: string } | undefined;
    [key: `name_N1_loop_${string}`]: StediN1Loop | undefined;
  };
  detail: {
    stop_off_details_S5_loop: Stedi204StopOff[];
  };
  summary?: {
    transaction_set_trailer_SE: {
      number_of_included_segments_01: string;
      transaction_set_control_number_02: string;
    };
  };
}

export interface StediGroupHeader {
  applicationSenderCode: string;
  applicationReceiverCode: string;
  date?: string;
  time?: string;
  groupControlNumber: string;
}

export interface Jedi204Stedi {
  envelope: StediEnvelope & { groupHeader: StediGroupHeader };
  transactionSets: Stedi204TransactionSet[];
}

// Jedi214 — Transportation Carrier Shipment Status Message (Stedi-compatible flat format)

export interface Stedi214TransactionSet {
  heading: {
    transaction_set_header_ST: {
      transaction_set_identifier_code_01: string;
      transaction_set_control_number_02: string;
    };
    beginning_segment_B10: {
      reference_identification_01: string;
      shipment_identification_number_02?: string;
      standard_carrier_alpha_code_03: string;
    };
    reference_identification_L11?: Array<{
      reference_identification_01: string;
      reference_identification_qualifier_02: string;
    }>;
    shipment_status_details_AT7?: Array<{
      shipment_status_code_01?: string;
      shipment_status_reason_code_02?: string;
      date_03?: string;
      time_04?: string;
    }>;
    equipment_location_MS1?: {
      city_name_01?: string;
      state_or_province_code_02?: string;
    };
    shipment_weight_AT8?: {
      weight_qualifier_01?: string;
      weight_unit_code_02?: string;
      weight_03?: number;
      lading_quantity_04?: number;
    };
  };
  summary?: {
    transaction_set_trailer_SE: {
      number_of_included_segments_01: string;
      transaction_set_control_number_02: string;
    };
  };
}

export interface Jedi214 {
  envelope: StediEnvelope;
  transactionSets: Stedi214TransactionSet[];
}

// Jedi211 — Motor Carrier Bill of Lading (Stedi-compatible flat format)
// Stedi mappings expect: { envelope, transactionSets[] } at the top level
// with guide-based field names (e.g. shipment_identification_number_03)

export interface StediEnvelope {
  interchangeHeader: {
    authorizationInformationQualifier?: string;
    authorizationInformation?: string;
    senderId: string;
    receiverId: string;
    controlNumber: string;
    acknowledgmentRequestedCode?: string;
    usageIndicatorCode?: string;
  };
}

export interface StediN1Loop {
  name_N1: {
    entity_identifier_code_01: string;
    name_02?: string;
    identification_code_qualifier_03?: string;
    identification_code_04?: string;
  };
  address_information_N3?: Array<{
    address_information_01: string;
    address_information_02?: string;
  }>;
  geographic_location_N4?: {
    city_name_01?: string;
    state_or_province_code_02?: string;
    postal_code_03?: string;
    country_code_04?: string;
  };
  contact_G61?: Array<{
    contact_function_code_01?: string;
    name_02?: string;
    communication_number_qualifier_03?: string;
    communication_number_04?: string;
  }>;
}

export interface Stedi211TransactionSet {
  heading: {
    transaction_set_header_ST: {
      transaction_set_identifier_code_01: string;
      transaction_set_control_number_02: string;
    };
    beginning_segment_for_the_motor_carrier_bill_of_lading_BOL: {
      standard_carrier_alpha_code_01: string;
      shipment_method_of_payment_02: string;
      shipment_identification_number_03: string;
      date_04?: string;
      time_05?: string;
      reference_identification_06?: string;
    };
    set_purpose_B2A?: {
      transaction_set_purpose_code_01: string;
    };
    business_instructions_and_reference_number_L11?: Array<{
      reference_identification_01: string;
      reference_identification_qualifier_02: string;
    }>;
    date_time_G62?: Array<{
      date_qualifier_01?: string;
      date_02?: string;
    }>;
    bill_of_lading_handling_requirements_AT5?: Array<{
      special_handling_code_01?: string;
      special_handling_description_02?: string;
    }>;
    remarks_K1?: Array<{
      free_form_message_01?: string;
      free_form_message_02?: string;
    }>;
    [key: `name_N1_loop_${string}`]: StediN1Loop | undefined;
  };
  detail: {
    bill_of_lading_line_item_number_AT1_loop?: Array<{
      bill_of_lading_line_item_detail_AT2_loop?: Array<{
        bill_of_lading_line_item_detail_AT2: {
          lading_quantity_01?: string;
          packaging_form_code_02?: string;
          weight_qualifier_03?: string;
          weight_unit_code_04?: string;
          weight_05?: string;
        };
      }>;
      bill_of_lading_description_AT4?: Array<{
        lading_description_01?: string;
      }>;
      bill_of_lading_charges_AT3?: Array<{
        allowance_or_charge_rate_01?: string;
        freight_rate_02?: string;
      }>;
      business_instructions_and_reference_number_L11?: Array<{
        reference_identification_01: string;
        reference_identification_qualifier_02: string;
      }>;
    }>;
  };
  summary?: {
    transaction_set_trailer_SE: {
      number_of_included_segments_01: string;
      transaction_set_control_number_02: string;
    };
  };
}

export interface Jedi211 {
  envelope: StediEnvelope;
  transactionSets: Stedi211TransactionSet[];
}

// Jedi997 — Functional Acknowledgment

export interface Jedi997 {
  heading: {
    transaction_set_header_ST: ST_Header;
    functional_group_response_header_AK1: {
      AK1_01_FunctionalIdentifierCode: string;
      AK1_02_GroupControlNumber: string;
    };
    transaction_set_response_loop_AK2?: Array<{
      transaction_set_response_header_AK2: {
        AK2_01_TransactionSetIdentifierCode: string;
        AK2_02_TransactionSetControlNumber: string;
      };
      transaction_set_response_trailer_AK5: {
        AK5_01_TransactionSetAcknowledgmentCode: string;
        AK5_02_ImplementationTransactionSetSyntaxErrorCode?: string;
      };
    }>;
    functional_group_response_trailer_AK9: {
      AK9_01_FunctionalGroupAcknowledgeCode: string;
      AK9_02_NumberOfTransactionSetsIncluded: string;
      AK9_03_NumberOfReceivedTransactionSets: string;
      AK9_04_NumberOfAcceptedTransactionSets: string;
    };
    transaction_set_trailer_SE: SE_Trailer;
  };
}

// Envelope wrappers

export interface JediFunctionalGroup {
  GS_02_ApplicationSenderCode: string;
  GS_03_ApplicationReceiverCode: string;
  GS_04_Date?: string;
  GS_05_Time?: string;
  GS_06_GroupControlNumber: string;
  transaction_sets: Array<Jedi204 | Jedi997>;
}

export interface JediInterchangeEnvelope {
  ISA_01_AuthorizationInformationQualifier: string;
  ISA_02_AuthorizationInformation: string;
  ISA_06_InterchangeSenderId: string;
  ISA_08_InterchangeReceiverId: string;
  ISA_13_InterchangeControlNumber: string;
  ISA_14_AcknowledgmentRequested?: string;
  ISA_15_InterchangeUsageIndicator?: string;
  functional_groups: JediFunctionalGroup[];
}

export type JediDocument =
  | { interchanges: JediInterchangeEnvelope[] }
  | Jedi204Stedi
  | Jedi214
  | Jedi211;
