## F-BPP/04 and F-PKP/03 normalized backend contract

`mustahik_surveys` is the additive normalized record for F-BPP/04. The existing legacy assessment payload remains in `source_payload`; normalized columns expose assistance type, survey date, domicile, surveyor, family/economy/urgency narratives, Had Kifayah conclusion, house/asset/income indicator JSON, four Likert values in `spiritual_likert_json`, raw assessment input, calculation result, recommendation amount, and the recorded scoring method. Profile identity and contact stay on the related `mustahik_profiles` row. `raw_assessment_json` and `calculation_result_json` have separate purposes and must not overwrite one another.

Typed photo references belong in `mustahik_survey_photo_refs`, with `photo_type` values `house_front`, `interior`, `interview`, and `calculation_evidence`; `file_ref` stores the existing artifact/file reference, not file content. The survey payload validator accepts Likert values only from 1 through 5 and requires indicator/calculation values to be JSON objects.

`mustahik_disbursements` is the additive normalized F-PKP/03 record. Its scalar fields cover form and transaction numbers, requester, amount and amount-in-words, purpose, source fund, bank/account, payment type, finance verification and attachment reference. `fund_source` is constrained to `Zakat`, `Infaq/Shadaqah`, `DSKL`, or `Hibah`. Approval actors and timestamps are rows in `mustahik_disbursement_approvals`; output metadata for the three physical copies is `output_copy_metadata_json` (`copies: 3` plus any controlled copy details). Legacy raw values remain available through `source_payload`, and the existing operational endpoints continue to use their legacy tables.

The migration is additive and rerunnable. Existing normalized rows receive new nullable/defaulted columns, legacy source payloads are preserved, and the existing read-model views retain their prior columns while adding the new contract fields.

### Business decisions still required

- The SOP states Priority 1 for a Had Kifayah deficit `> -Rp2,000,000`, which overlaps the stated Priority 2/3 thresholds. Do not encode a priority rule until the business owner resolves the threshold/order.
- The SOP does not specify scoring weights or a formula. Persist raw indicators and any externally supplied calculation result separately; do not derive a score or invent weights.
