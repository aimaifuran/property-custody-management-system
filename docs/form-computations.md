# IAR, ICS and PAR computations

Enter quantity and unit cost. Each row amount is quantity multiplied by unit cost, rounded to two decimal places. The document total is the sum of the rounded row amounts. The server calculates amounts again on save, including edits.

For example, 3 units at 20,000.25 each have a row amount of 60,000.75.

## Receipt and issuance

1. IAR records the received quantities and costs and posts them to stock. Cost inputs are optional: a blank cost uses the existing stock price, or zero for a new stock item. Enter the known purchase cost explicitly for accurate valuation. The editor shows zero for a blank cost until the saved price is returned. Receipt quantities and costs are locked after posting.
2. The generated RIS starts as a draft. Review the actual quantities to issue and the recipient before approving issuance.
3. Issuance uses the unit cost from the source inventory receipt and the quantity actually issued. Asset items below the system's 50,000 unit-cost threshold produce ICS; asset items at or above it produce PAR. Supply items do not produce accountability forms. Classification depends on unit cost, not the complete row amount.
4. ICS shows quantity, unit cost and calculated total cost. PAR now accepts unit cost and calculates Amount as the complete row amount. PAR exports still show the official Amount column.
5. Forms linked to a user's issued accountability remain locked; use acceptance, transfer and return actions to move those assets.

Old PAR records without unit cost keep their stored row amounts on the server. When opened in the editor, unit cost is inferred from amount divided by quantity, so later quantity edits can recalculate the amount. Existing stored records are not bulk rewritten.

Standalone ICS/PAR forms calculate their amounts but do not post inventory movements. Use IAR receipt and approved RIS issuance for the connected stock workflow.
