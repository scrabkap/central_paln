#!/usr/bin/env python3
"""Generate infra/template.yaml by injecting DynamoDB table resources
(derived from dynamodb_tables.json) into infra/template_head.yaml.

Run:  python3 tools/build_template.py
"""
import json
import os
import re
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEAD = os.path.join(ROOT, "infra", "template_head.yaml")
SRC = os.path.join(ROOT, "dynamodb_tables.json")
OUT = os.path.join(ROOT, "infra", "template.yaml")

# Extra pass-2 table the dashboard needs for KPI trend charts.
KPI_TABLE = {
    "TableName": "cp_kpi_snapshots",
    "AttributeDefinitions": [
        {"AttributeName": "PK", "AttributeType": "S"},
        {"AttributeName": "SK", "AttributeType": "S"},
    ],
    "KeySchema": [
        {"AttributeName": "PK", "KeyType": "HASH"},
        {"AttributeName": "SK", "KeyType": "RANGE"},
    ],
    "BillingMode": "PAY_PER_REQUEST",
    "PointInTimeRecoverySpecification": {"PointInTimeRecoveryEnabled": True},
}


def logical_name(table_name: str) -> str:
    """cp_items -> CpItemsTable"""
    parts = re.split(r"[_\-]", table_name)
    return "".join(p.capitalize() for p in parts if p) + "Tbl"


def to_cfn_properties(tbl: dict) -> dict:
    props = {}
    props["TableName"] = tbl["TableName"]
    props["BillingMode"] = tbl.get("BillingMode", "PAY_PER_REQUEST")
    props["AttributeDefinitions"] = tbl["AttributeDefinitions"]
    props["KeySchema"] = tbl["KeySchema"]
    if tbl.get("GlobalSecondaryIndexes"):
        gsis = []
        for g in tbl["GlobalSecondaryIndexes"]:
            gsis.append(
                {
                    "IndexName": g["IndexName"],
                    "KeySchema": g["KeySchema"],
                    "Projection": g["Projection"],
                }
            )
        props["GlobalSecondaryIndexes"] = gsis
    if tbl.get("PointInTimeRecoverySpecification"):
        props["PointInTimeRecoverySpecification"] = tbl[
            "PointInTimeRecoverySpecification"
        ]
    if tbl.get("TimeToLiveSpecification"):
        props["TimeToLiveSpecification"] = tbl["TimeToLiveSpecification"]
    if tbl.get("StreamSpecification"):
        # CFN only takes StreamViewType (presence implies enabled).
        props["StreamSpecification"] = {
            "StreamViewType": tbl["StreamSpecification"].get(
                "StreamViewType", "NEW_AND_OLD_IMAGES"
            )
        }
    return props


def main():
    with open(SRC, encoding="utf-8") as fh:
        spec = json.load(fh)

    tables = list(spec["Tables"]) + [KPI_TABLE]

    resources = {}
    for tbl in tables:
        resources[logical_name(tbl["TableName"])] = {
            "Type": "AWS::DynamoDB::Table",
            "Properties": to_cfn_properties(tbl),
        }

    block = yaml.dump(
        resources,
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
        width=4096,
    )
    # Indent every line by 2 spaces to sit inside the Resources: mapping.
    block_indented = "\n".join(
        ("  " + line if line.strip() else line) for line in block.splitlines()
    )

    with open(HEAD, encoding="utf-8") as fh:
        head = fh.read()

    marker = "  # __DYNAMO_TABLES__"
    if marker not in head:
        raise SystemExit("marker not found in template_head.yaml")
    out = head.replace(marker, block_indented.rstrip())

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(out)

    print(f"Wrote {OUT} with {len(tables)} DynamoDB tables.")


if __name__ == "__main__":
    main()
