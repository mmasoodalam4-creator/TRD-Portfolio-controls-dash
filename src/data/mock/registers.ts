// Per-project registers, keyed by project id.
// Generated from the legacy src/data.js so the demo figures are provably
// unchanged by the migration. Every screen reads from here, which is what
// keeps the numbers consistent across modules.
import type {
  WbsNode,
  CostCategory,
  Variation,
  ChangeRequest,
  ProcurementPackage,
  ManpowerTrade,
  EquipmentItem,
  Ncr,
  Risk,
  Issue,
  PaymentClaim,
} from '@/domain/types';

export const wbs: Record<string, WbsNode[]> = {
  "RES-01": [
    {
      "code": "1.0",
      "name": "Naseem Residences",
      "budget": 1250000000,
      "pv": 850000000,
      "ev": 680000000,
      "ac": 720000000,
      "prog": 68,
      "spi": 0.8,
      "cpi": 0.94,
      "status": "On Track",
      "level": 0
    },
    {
      "code": "1.1",
      "name": "Pre-Construction",
      "budget": 40000000,
      "pv": 30000000,
      "ev": 30000000,
      "ac": 32000000,
      "prog": 100,
      "spi": 1,
      "cpi": 0.94,
      "status": "Completed",
      "level": 1
    },
    {
      "code": "1.1.1",
      "name": "Mobilization",
      "budget": 15000000,
      "pv": 15000000,
      "ev": 15000000,
      "ac": 14000000,
      "prog": 100,
      "spi": 1,
      "cpi": 1.07,
      "status": "Completed",
      "level": 2
    },
    {
      "code": "1.1.2",
      "name": "Design & Approvals",
      "budget": 25000000,
      "pv": 15000000,
      "ev": 15000000,
      "ac": 18000000,
      "prog": 100,
      "spi": 1,
      "cpi": 0.83,
      "status": "Completed",
      "level": 2
    },
    {
      "code": "1.2",
      "name": "Substructure",
      "budget": 220000000,
      "pv": 160000000,
      "ev": 120000000,
      "ac": 130000000,
      "prog": 55,
      "spi": 0.75,
      "cpi": 0.92,
      "status": "On Track",
      "level": 1
    },
    {
      "code": "1.2.1",
      "name": "Excavation",
      "budget": 60000000,
      "pv": 50000000,
      "ev": 45000000,
      "ac": 48000000,
      "prog": 90,
      "spi": 0.9,
      "cpi": 0.94,
      "status": "On Track",
      "level": 2
    },
    {
      "code": "1.2.2",
      "name": "Foundation",
      "budget": 100000000,
      "pv": 70000000,
      "ev": 45000000,
      "ac": 50000000,
      "prog": 45,
      "spi": 0.64,
      "cpi": 0.9,
      "status": "At Risk",
      "level": 2
    },
    {
      "code": "1.2.3",
      "name": "Basement Works",
      "budget": 60000000,
      "pv": 40000000,
      "ev": 30000000,
      "ac": 32000000,
      "prog": 50,
      "spi": 0.75,
      "cpi": 0.94,
      "status": "On Track",
      "level": 2
    },
    {
      "code": "1.3",
      "name": "Superstructure",
      "budget": 370000000,
      "pv": 260000000,
      "ev": 180000000,
      "ac": 200000000,
      "prog": 55,
      "spi": 0.69,
      "cpi": 0.9,
      "status": "At Risk",
      "level": 1
    },
    {
      "code": "1.4",
      "name": "MEP",
      "budget": 250000000,
      "pv": 160000000,
      "ev": 110000000,
      "ac": 125000000,
      "prog": 44,
      "spi": 0.69,
      "cpi": 0.88,
      "status": "At Risk",
      "level": 1
    },
    {
      "code": "1.5",
      "name": "Finishes",
      "budget": 200000000,
      "pv": 120000000,
      "ev": 70000000,
      "ac": 75000000,
      "prog": 35,
      "spi": 0.58,
      "cpi": 0.93,
      "status": "At Risk",
      "level": 1
    },
    {
      "code": "1.6",
      "name": "External Works",
      "budget": 70000000,
      "pv": 40000000,
      "ev": 25000000,
      "ac": 28000000,
      "prog": 36,
      "spi": 0.63,
      "cpi": 0.89,
      "status": "At Risk",
      "level": 1
    },
    {
      "code": "1.7",
      "name": "Commissioning",
      "budget": 30000000,
      "pv": 20000000,
      "ev": 15000000,
      "ac": 15000000,
      "prog": 75,
      "spi": 0.75,
      "cpi": 1,
      "status": "On Track",
      "level": 1
    }
  ]
};

export const costCategories: Record<string, CostCategory[]> = {
  "RES-01": [
    {
      "cat": "Land Cost",
      "budget": 300000000,
      "committed": 300000000,
      "actual": 280000000,
      "ev": 280000000,
      "afc": 300000000,
      "varc": 0,
      "varpct": 0,
      "status": "On Track"
    },
    {
      "cat": "Consultants Fees",
      "budget": 50000000,
      "committed": 45000000,
      "actual": 30000000,
      "ev": 48000000,
      "afc": 48000000,
      "varc": 2000000,
      "varpct": 4,
      "status": "On Track"
    },
    {
      "cat": "Construction Cost",
      "budget": 650000000,
      "committed": 630000000,
      "actual": 420000000,
      "ev": 630000000,
      "afc": 630000000,
      "varc": 20000000,
      "varpct": 3.1,
      "status": "On Track"
    },
    {
      "cat": "MEP",
      "budget": 150000000,
      "committed": 140000000,
      "actual": 90000000,
      "ev": 145000000,
      "afc": 145000000,
      "varc": 5000000,
      "varpct": 3.3,
      "status": "On Track"
    },
    {
      "cat": "Contingency",
      "budget": 70000000,
      "committed": 0,
      "actual": 0,
      "ev": 0,
      "afc": 50000000,
      "varc": 20000000,
      "varpct": 28.6,
      "status": "Favorable"
    },
    {
      "cat": "Other Costs",
      "budget": 30000000,
      "committed": 25000000,
      "actual": 10000000,
      "ev": 25000000,
      "afc": 25000000,
      "varc": 5000000,
      "varpct": 16.7,
      "status": "On Track"
    }
  ]
};

export const variations: Record<string, Variation[]> = {
  "RES-01": [
    {
      "no": "VO-015",
      "title": "Additional RC Walls at B2",
      "packageId": "PR-002",
      "type": "Client Change",
      "cat": "Structure",
      "date": "12 Apr 2025",
      "by": "Site Engineer",
      "impact": "High",
      "amount": 2500000,
      "status": "Approved",
      "desc": "Additional reinforced concrete retaining walls required at Basement 2 as per client request due to soil condition.",
      "docs": [
        "VO-015_Drawing.pdf",
        "Geotech_Report_B2.pdf"
      ]
    },
    {
      "no": "VO-014",
      "title": "MEP Design Change",
      "packageId": "PR-004",
      "type": "Consultant Change",
      "cat": "MEP",
      "date": "05 May 2025",
      "by": "MEP Lead",
      "impact": "Medium",
      "amount": 1200000,
      "status": "Under Review",
      "desc": "HVAC routing revision to accommodate revised ceiling heights.",
      "docs": [
        "MEP_Revision_R2.pdf"
      ]
    },
    {
      "no": "VO-013",
      "title": "Finishes Upgrade – Lobby",
      "packageId": "PR-005",
      "type": "Client Change",
      "cat": "Finishes",
      "date": "20 Apr 2025",
      "by": "Client",
      "impact": "Medium",
      "amount": 3750000,
      "status": "Approved",
      "desc": "Upgraded marble finishes to the main lobby and entrance.",
      "docs": [
        "Finishes_Spec.pdf"
      ]
    },
    {
      "no": "VO-012",
      "title": "Extra Excavation – West Side",
      "packageId": "PR-001",
      "type": "Site Condition",
      "cat": "Substructure",
      "date": "18 Mar 2025",
      "by": "Site Engineer",
      "impact": "High",
      "amount": 4800000,
      "status": "Approved",
      "desc": "Unforeseen rock excavation on the west boundary.",
      "docs": [
        "Excavation_Survey.pdf"
      ]
    },
    {
      "no": "VO-011",
      "title": "Additional Steel Rebar",
      "packageId": "PR-003",
      "type": "Design Change",
      "cat": "Structure",
      "date": "01 May 2025",
      "by": "Structural Lead",
      "impact": "Medium",
      "amount": 1650000,
      "status": "Under Review",
      "desc": "Rebar increase per revised structural calculations.",
      "docs": [
        "Structural_Calc_R3.pdf"
      ]
    },
    {
      "no": "VO-010",
      "title": "HVAC Capacity Increase",
      "packageId": "PR-007",
      "type": "Client Change",
      "cat": "MEP",
      "date": "25 Mar 2025",
      "by": "Client",
      "impact": "Medium",
      "amount": 2150000,
      "status": "Approved",
      "desc": "Chiller capacity uplift for future tenant loads.",
      "docs": [
        "HVAC_Load.pdf"
      ]
    },
    {
      "no": "VO-009",
      "title": "Stone Cladding Change",
      "packageId": "PR-005",
      "type": "Client Change",
      "cat": "Finishes",
      "date": "15 Feb 2025",
      "by": "Client",
      "impact": "Low",
      "amount": 950000,
      "status": "Rejected",
      "desc": "Facade stone type change — rejected on cost grounds.",
      "docs": []
    },
    {
      "no": "VO-008",
      "title": "Additional Drain Lines",
      "packageId": "PR-004",
      "type": "Site Condition",
      "cat": "MEP",
      "date": "10 Feb 2025",
      "by": "Site Engineer",
      "impact": "Medium",
      "amount": 1100000,
      "status": "Rejected",
      "desc": "Extra storm drainage — deferred to Phase 2.",
      "docs": []
    }
  ]
};

export const changes: Record<string, ChangeRequest[]> = {
  "RES-01": [
    {
      "no": "CL-012",
      "title": "Additional Basement Excavation",
      "cat": "Site Condition",
      "date": "18 Apr 2025",
      "impact": "High",
      "amount": 5200000,
      "status": "Approved",
      "by": "Site Engineer",
      "desc": "Additional excavation required at Basement 2 area due to unexpected hard rock layer at existing level -3.2m, as per geotechnical report revision R2.",
      "docs": [
        "Geotech_Report_R2.pdf",
        "Excavation_Drawings.pdf"
      ]
    },
    {
      "no": "CL-011",
      "title": "Revised Façade Design",
      "cat": "Design Change",
      "date": "12 Apr 2025",
      "impact": "Medium",
      "amount": 3450000,
      "status": "Approved",
      "by": "Architect",
      "desc": "Facade redesign for improved thermal performance.",
      "docs": [
        "Facade_R2.pdf"
      ]
    },
    {
      "no": "CL-010",
      "title": "MEP Layout Optimization",
      "cat": "Design Change",
      "date": "08 Apr 2025",
      "impact": "Medium",
      "amount": 2150000,
      "status": "Under Review",
      "by": "MEP Lead",
      "desc": "Optimised MEP routing to reduce clashes.",
      "docs": []
    },
    {
      "no": "CL-009",
      "title": "Soil Condition Variation",
      "cat": "Site Condition",
      "date": "02 Apr 2025",
      "impact": "High",
      "amount": 4800000,
      "status": "Approved",
      "by": "Site Engineer",
      "desc": "Soil remediation on west boundary.",
      "docs": [
        "Soil_Test.pdf"
      ]
    },
    {
      "no": "CL-008",
      "title": "Parking Layout Modification",
      "cat": "Client Change",
      "date": "28 Mar 2025",
      "impact": "Low",
      "amount": 1250000,
      "status": "Approved",
      "by": "Client",
      "desc": "Revised parking bay layout.",
      "docs": []
    },
    {
      "no": "CL-007",
      "title": "Additional Steel Quantity",
      "cat": "Design Change",
      "date": "25 Mar 2025",
      "impact": "Medium",
      "amount": 2950000,
      "status": "Approved",
      "by": "Structural Lead",
      "desc": "Steel uplift per revised loads.",
      "docs": []
    },
    {
      "no": "CL-006",
      "title": "Landscape Scope Addition",
      "cat": "Client Change",
      "date": "20 Mar 2025",
      "impact": "Low",
      "amount": 950000,
      "status": "Under Review",
      "by": "Client",
      "desc": "Extended landscape works.",
      "docs": []
    },
    {
      "no": "CL-005",
      "title": "Utility Network Adjustment",
      "cat": "Site Condition",
      "date": "15 Mar 2025",
      "impact": "Medium",
      "amount": 1800000,
      "status": "Approved",
      "by": "Site Engineer",
      "desc": "Utility rerouting.",
      "docs": []
    }
  ]
};

export const procurement: Record<string, ProcurementPackage[]> = {
  "RES-01": [
    {
      "id": "PR-001",
      "name": "Excavation Works",
      "cat": "Civil Works",
      "type": "Works",
      "contractor": "Al Rajhi Contracting",
      "role": "Trade Contractor",
      "wbs": "1.2",
      "retention": 5.0,
      "awarded": "2025-03-10",
      "value": 120000000,
      "committed": 120000000,
      "paid": 60000000,
      "prog": 50,
      "status": "In Progress"
    },
    {
      "id": "PR-002",
      "name": "Concrete Works",
      "cat": "Civil Works",
      "type": "Works",
      "contractor": "BuildTech Co.",
      "role": "Main Contractor",
      "wbs": "1.2",
      "retention": 5.0,
      "awarded": "2025-04-02",
      "value": 180000000,
      "committed": 180000000,
      "paid": 72000000,
      "prog": 40,
      "status": "In Progress"
    },
    {
      "id": "PR-003",
      "name": "Steel Structure",
      "cat": "Structure",
      "type": "Works",
      "contractor": "National Steel Co.",
      "role": "Trade Contractor",
      "wbs": "1.3",
      "retention": 5.0,
      "awarded": "2025-05-19",
      "value": 150000000,
      "committed": 150000000,
      "paid": 75000000,
      "prog": 50,
      "status": "In Progress"
    },
    {
      "id": "PR-004",
      "name": "MEP Works",
      "cat": "MEP",
      "type": "Works",
      "contractor": "Electro Mechanical Co.",
      "role": "Trade Contractor",
      "wbs": "1.4",
      "retention": 5.0,
      "awarded": "2025-06-11",
      "value": 200000000,
      "committed": 200000000,
      "paid": 80000000,
      "prog": 40,
      "status": "In Progress"
    },
    {
      "id": "PR-005",
      "name": "Facade Works",
      "cat": "Architectural",
      "type": "Works",
      "contractor": "AluTech Facades",
      "role": "Trade Contractor",
      "wbs": "1.3",
      "retention": 10.0,
      "awarded": "2025-07-08",
      "value": 85000000,
      "committed": 85000000,
      "paid": 34000000,
      "prog": 40,
      "status": "In Progress"
    },
    {
      "id": "PR-006",
      "name": "Elevators",
      "cat": "MEP",
      "type": "Supply",
      "contractor": "KONE Middle East",
      "role": "Supplier",
      "wbs": "1.4",
      "retention": 5.0,
      "awarded": "2025-08-14",
      "value": 45000000,
      "committed": 45000000,
      "paid": 22500000,
      "prog": 50,
      "status": "In Progress"
    },
    {
      "id": "PR-007",
      "name": "HVAC Systems",
      "cat": "MEP",
      "type": "Supply",
      "contractor": "Daikin Gulf",
      "role": "Supplier",
      "wbs": "1.4",
      "retention": 5.0,
      "awarded": "2025-09-02",
      "value": 38000000,
      "committed": 38000000,
      "paid": 15200000,
      "prog": 40,
      "status": "In Progress"
    },
    {
      "id": "PR-008",
      "name": "Plumbing Fixtures",
      "cat": "MEP",
      "type": "Supply",
      "contractor": "Ideal Standard",
      "role": "Supplier",
      "wbs": "1.4",
      "retention": 0.0,
      "awarded": "2025-09-23",
      "value": 12000000,
      "committed": 12000000,
      "paid": 4800000,
      "prog": 100,
      "status": "Completed"
    },
    {
      "id": "PR-009",
      "name": "Landscaping Works",
      "cat": "External Works",
      "type": "Works",
      "contractor": "GreenScape Co.",
      "role": "Trade Contractor",
      "wbs": "1.6",
      "retention": 5.0,
      "awarded": "2025-10-15",
      "value": 18000000,
      "committed": 18000000,
      "paid": 7200000,
      "prog": 40,
      "status": "In Progress"
    },
    {
      "id": "PR-010",
      "name": "Site Hoarding",
      "cat": "Temporary Works",
      "type": "Works",
      "contractor": "Safety First Co.",
      "role": "Trade Contractor",
      "wbs": "1.1",
      "retention": 0.0,
      "awarded": "2025-02-04",
      "value": 5000000,
      "committed": 5000000,
      "paid": 2500000,
      "prog": 100,
      "status": "Completed"
    },
    {
      "id": "PR-011",
      "name": "Project Management Consultancy",
      "cat": "Consultancy",
      "type": "Services",
      "contractor": "ABC PMC",
      "role": "PMC",
      "wbs": "1.1",
      "retention": 0,
      "awarded": "2025-01-08",
      "value": 28000000,
      "committed": 28000000,
      "paid": 14000000,
      "prog": 55,
      "status": "In Progress"
    },
    {
      "id": "PR-012",
      "name": "Design & Site Supervision",
      "cat": "Consultancy",
      "type": "Services",
      "contractor": "Studio Qadr Architects",
      "role": "Design Consultant",
      "wbs": "1.1",
      "retention": 0,
      "awarded": "2024-11-15",
      "value": 14000000,
      "committed": 14000000,
      "paid": 7000000,
      "prog": 65,
      "status": "In Progress"
    },
    {
      "id": "PR-013",
      "name": "Payment & Quantity Verification",
      "cat": "Consultancy",
      "type": "Services",
      "contractor": "Ledger Quantity Surveyors",
      "role": "Verification Consultant",
      "wbs": "1.1",
      "retention": 0,
      "awarded": "2025-01-08",
      "value": 8000000,
      "committed": 8000000,
      "paid": 4000000,
      "prog": 55,
      "status": "In Progress"
    }
  ]
};

export const manpower: Record<string, ManpowerTrade[]> = {
  "RES-01": [
    {
      "trade": "Civil Works",
      "type": "Direct",
      "direct": 56,
      "indirect": 18,
      "labor": 32,
      "total": 106,
      "hours": 16850,
      "prod": 1.32,
      "varpct": "+8.6%",
      "status": "On Track"
    },
    {
      "trade": "MEP",
      "type": "Direct",
      "direct": 32,
      "indirect": 10,
      "labor": 15,
      "total": 57,
      "hours": 9250,
      "prod": 1.28,
      "varpct": "+5.3%",
      "status": "On Track"
    },
    {
      "trade": "Finishes",
      "type": "Direct",
      "direct": 18,
      "indirect": 6,
      "labor": 25,
      "total": 49,
      "hours": 6780,
      "prod": 1.18,
      "varpct": "-2.1%",
      "status": "At Risk"
    },
    {
      "trade": "Structural Steel",
      "type": "Direct",
      "direct": 8,
      "indirect": 3,
      "labor": 6,
      "total": 17,
      "hours": 2450,
      "prod": 1.41,
      "varpct": "+11.2%",
      "status": "On Track"
    },
    {
      "trade": "Electrical",
      "type": "Indirect",
      "direct": 0,
      "indirect": 6,
      "labor": 4,
      "total": 10,
      "hours": 1520,
      "prod": 1.1,
      "varpct": "-4.5%",
      "status": "At Risk"
    },
    {
      "trade": "Mechanical",
      "type": "Direct",
      "direct": 0,
      "indirect": 5,
      "labor": 4,
      "total": 9,
      "hours": 1300,
      "prod": 1.2,
      "varpct": "+1.6%",
      "status": "On Track"
    },
    {
      "trade": "General Labour",
      "type": "Direct",
      "direct": 0,
      "indirect": 0,
      "labor": 12,
      "total": 12,
      "hours": 1150,
      "prod": 0.95,
      "varpct": "-9.3%",
      "status": "Behind"
    },
    {
      "trade": "Landscaping",
      "type": "Direct",
      "direct": 4,
      "indirect": 0,
      "labor": 3,
      "total": 7,
      "hours": 980,
      "prod": 1.15,
      "varpct": "-1.1%",
      "status": "On Track"
    }
  ]
};

export const equipment: Record<string, EquipmentItem[]> = {
  "RES-01": [
    {
      "id": "EQ-001",
      "name": "Excavator 320D",
      "cat": "Earthmoving",
      "type": "Excavator",
      "model": "CAT 320D",
      "loc": "Zone A - North",
      "status": "Operating",
      "util": 72,
      "lastService": "15 Jul 2026",
      "nextService": "15 Sep 2026"
    },
    {
      "id": "EQ-002",
      "name": "Dump Truck Tipper",
      "cat": "Earthmoving",
      "type": "Tipper",
      "model": "Mercedes 4141",
      "loc": "Zone B - East",
      "status": "Operating",
      "util": 65,
      "lastService": "10 Jul 2026",
      "nextService": "10 Sep 2026"
    },
    {
      "id": "EQ-003",
      "name": "Concrete Mixer",
      "cat": "Concrete",
      "type": "Mixer",
      "model": "Zoomlion 9m³",
      "loc": "Batching Plant",
      "status": "Operating",
      "util": 80,
      "lastService": "12 Jul 2026",
      "nextService": "12 Sep 2026"
    },
    {
      "id": "EQ-004",
      "name": "Tower Crane TC-01",
      "cat": "Lifting",
      "type": "Tower Crane",
      "model": "Potain MDT 219",
      "loc": "Zone A - Center",
      "status": "Operating",
      "util": 60,
      "lastService": "08 Jul 2026",
      "nextService": "08 Sep 2026"
    },
    {
      "id": "EQ-005",
      "name": "Generator 250 KVA",
      "cat": "Power",
      "type": "Generator",
      "model": "Cummins C250",
      "loc": "Site Office",
      "status": "Under Maintenance",
      "util": 0,
      "lastService": "20 Jun 2026",
      "nextService": "25 Aug 2026"
    },
    {
      "id": "EQ-006",
      "name": "Water Pump 6\"",
      "cat": "Utilities",
      "type": "Water Pump",
      "model": "Kirloskar 6ST",
      "loc": "Zone C - South",
      "status": "Operating",
      "util": 55,
      "lastService": "18 Jul 2026",
      "nextService": "18 Sep 2026"
    },
    {
      "id": "EQ-007",
      "name": "Forklift 3 Ton",
      "cat": "Material Handling",
      "type": "Forklift",
      "model": "Toyota 8FD30",
      "loc": "Store Yard",
      "status": "Out of Service",
      "util": 0,
      "lastService": "05 Jul 2026",
      "nextService": null
    },
    {
      "id": "EQ-008",
      "name": "Vibratory Roller",
      "cat": "Compaction",
      "type": "Roller",
      "model": "BOMAG BW212",
      "loc": "Zone B - Road",
      "status": "Operating",
      "util": 75,
      "lastService": "14 Jul 2026",
      "nextService": "14 Sep 2026"
    }
  ]
};

export const ncrs: Record<string, Ncr[]> = {
  "RES-01": [
    {
      "no": "NCR-025",
      "title": "Honeycombing in Column C12",
      "packageId": "PR-002",
      "discipline": "Structural",
      "type": "Workmanship",
      "severity": "Major",
      "raised": "18 Aug 2026",
      "due": "08 Sep 2026",
      "status": "Open",
      "resp": "Ali Raza",
      "loc": "Level B2 - Column C12",
      "desc": "Honeycombing observed on the surface of Column C12 as a result of improper vibration during concrete pouring. Affects structural durability and finish.",
      "docs": [
        "Photo_01.jpg",
        "Photo_02.jpg",
        "Inspection_Report_0826.pdf"
      ]
    },
    {
      "no": "NCR-024",
      "title": "Rebar Spacing Not as per Drawing",
      "packageId": "PR-002",
      "discipline": "Structural",
      "type": "Workmanship",
      "severity": "Minor",
      "raised": "16 Aug 2026",
      "due": "06 Sep 2026",
      "status": "Open",
      "resp": "Imran Khan",
      "loc": "Level 3 Slab",
      "desc": "Rebar spacing exceeds tolerance.",
      "docs": []
    },
    {
      "no": "NCR-023",
      "title": "Water Leakage at Basement Wall",
      "packageId": "PR-001",
      "discipline": "Civil",
      "type": "Material",
      "severity": "Major",
      "raised": "06 Jul 2026",
      "due": "27 Jul 2026",
      "status": "Overdue",
      "resp": "Sajid Ahmed",
      "loc": "Basement 1",
      "desc": "Water ingress at construction joint.",
      "docs": []
    },
    {
      "no": "NCR-022",
      "title": "Tile Alignment Deviation",
      "packageId": "PR-005",
      "discipline": "Architectural",
      "type": "Workmanship",
      "severity": "Minor",
      "raised": "12 Aug 2026",
      "due": "02 Sep 2026",
      "status": "Open",
      "resp": "Naveed Ali",
      "loc": "Lobby",
      "desc": "Tile alignment out of tolerance.",
      "docs": []
    },
    {
      "no": "NCR-021",
      "title": "Paint Finish Uneven",
      "packageId": "PR-005",
      "discipline": "Architectural",
      "type": "Workmanship",
      "severity": "Minor",
      "raised": "14 Jul 2026",
      "due": "04 Aug 2026",
      "status": "Overdue",
      "resp": "Naveed Ali",
      "loc": "Level 5",
      "desc": "Uneven paint finish.",
      "docs": []
    },
    {
      "no": "NCR-020",
      "title": "Conduit Not Properly Clamped",
      "packageId": "PR-004",
      "discipline": "MEP",
      "type": "Installation",
      "severity": "Minor",
      "raised": "10 Aug 2026",
      "due": "31 Aug 2026",
      "status": "Open",
      "resp": "Rashid Khan",
      "loc": "Level 4",
      "desc": "Conduit clamping deficiency.",
      "docs": []
    },
    {
      "no": "NCR-019",
      "title": "AC Duct Sealing Incomplete",
      "packageId": "PR-007",
      "discipline": "MEP",
      "type": "Workmanship",
      "severity": "Minor",
      "raised": "14 Aug 2026",
      "due": "04 Sep 2026",
      "status": "Open",
      "resp": "Rashid Khan",
      "loc": "Level 4",
      "desc": "Duct sealing incomplete.",
      "docs": []
    },
    {
      "no": "NCR-018",
      "title": "Soil Compaction Below Specified",
      "packageId": "PR-001",
      "discipline": "Civil",
      "type": "Testing",
      "severity": "Major",
      "raised": "20 Aug 2026",
      "due": "10 Sep 2026",
      "status": "Open",
      "resp": "Sajid Ahmed",
      "loc": "Zone B",
      "desc": "Compaction test failed.",
      "docs": []
    }
  ]
};

export const risks: Record<string, Risk[]> = {
  "RES-01": [
    {
      "id": "RISK-028",
      "desc": "Delay in Material Supply",
      "cat": "Supply Chain",
      "impact": "High",
      "prob": "High",
      "score": 25,
      "level": "High",
      "exposure": 8500000,
      "owner": "Ahmed Khan",
      "status": "Active"
    },
    {
      "id": "RISK-021",
      "desc": "Design Changes by Client",
      "cat": "Design",
      "impact": "High",
      "prob": "Medium",
      "score": 20,
      "level": "High",
      "exposure": 6200000,
      "owner": "Imran Khan",
      "status": "Active"
    },
    {
      "id": "RISK-017",
      "desc": "Weather Conditions Impact",
      "cat": "External",
      "impact": "High",
      "prob": "Medium",
      "score": 20,
      "level": "High",
      "exposure": 5100000,
      "owner": "Naveed Ali",
      "status": "Active"
    },
    {
      "id": "RISK-013",
      "desc": "Skilled Labor Shortage",
      "cat": "Manpower",
      "impact": "Medium",
      "prob": "High",
      "score": 16,
      "level": "Medium",
      "exposure": 2800000,
      "owner": "Ali Raza",
      "status": "Active"
    },
    {
      "id": "RISK-009",
      "desc": "Cost Escalation",
      "cat": "Financial",
      "impact": "High",
      "prob": "Low",
      "score": 12,
      "level": "Medium",
      "exposure": 1600000,
      "owner": "Sajid Ahmed",
      "status": "Active"
    },
    {
      "id": "RISK-005",
      "desc": "Equipment Breakdown",
      "cat": "Equipment",
      "impact": "Medium",
      "prob": "Medium",
      "score": 9,
      "level": "Medium",
      "exposure": 1200000,
      "owner": "Ahmed Khan",
      "status": "Monitoring"
    },
    {
      "id": "RISK-003",
      "desc": "Permit Approval Delay",
      "cat": "Regulatory",
      "impact": "Medium",
      "prob": "Low",
      "score": 6,
      "level": "Low",
      "exposure": 600000,
      "owner": "Imran Khan",
      "status": "Monitoring"
    },
    {
      "id": "RISK-001",
      "desc": "Minor Quality Rework",
      "cat": "Quality",
      "impact": "Low",
      "prob": "Medium",
      "score": 4,
      "level": "Low",
      "exposure": 300000,
      "owner": "Naveed Ali",
      "status": "Monitoring"
    }
  ]
};

export const issues: Record<string, Issue[]> = {
  "RES-01": [
    {
      "id": "ISS-009",
      "desc": "Design verification reports pending",
      "priority": "High",
      "owner": "PMC Design Office",
      "opened": "15 Jun 2026",
      "cost": 0,
      "days": 68,
      "status": "Open"
    },
    {
      "id": "ISS-008",
      "desc": "Contractor labour shortfall vs plan",
      "priority": "Critical",
      "owner": "Contractor Resourcing",
      "opened": "20 Jun 2026",
      "cost": 0,
      "days": 63,
      "status": "Open"
    },
    {
      "id": "ISS-007",
      "desc": "Long-lead equipment PR delay",
      "priority": "Medium",
      "owner": "PMC Technical Office",
      "opened": "01 Jul 2026",
      "cost": 0,
      "days": 52,
      "status": "In Progress"
    },
    {
      "id": "ISS-006",
      "desc": "Variation entitlement undetermined",
      "priority": "High",
      "owner": "Commercial Manager",
      "opened": "10 Jul 2026",
      "cost": 850000,
      "days": 43,
      "status": "Escalated"
    },
    {
      "id": "ISS-005",
      "desc": "Access road blocked by utility works",
      "priority": "Medium",
      "owner": "Site Manager",
      "opened": "18 Jul 2026",
      "cost": 0,
      "days": 35,
      "status": "In Progress"
    }
  ]
};

/**
 * Payment claims, as the RES-01 template every development is derived from.
 *
 * `claimed`, `verified` and `approved` are written as the weights the
 * derivation apportions, not as final figures: the apportionment scales them
 * so that approvals sum to what the development has certified and transfers
 * sum to what it has paid. `deriveClaims` computes retention from the rate on
 * each claim, decides which claims the money has actually left against, and
 * makes the boundary claim part paid so both totals land exactly.
 *
 * Three claims are still in flight — two with the consultant and one with the
 * approver — because a register in which every claim has completed is not a
 * pipeline, and the pipeline is what the owner asked to see.
 */
export const claims: Record<string, PaymentClaim[]> = {
  "RES-01": [
    {
      "id": "PC-001", "packageId": "PR-001", "contractor": "Al Rajhi Contracting",
      "milestone": "M-03 Bulk excavation complete", "raised": "2025-11-04",
      "claimed": 62000000, "verifiedBy": "Ledger Quantity Surveyors", "verifiedOn": "2025-11-12",
      "verifiedRef": "VR-118", "verified": 60500000, "approved": 60500000,
      "retentionRate": 5, "retention": 0, "released": 0, "paid": 0, "paidOn": "2025-11-26", "state": "Paid"
    },
    {
      "id": "PC-002", "packageId": "PR-002", "contractor": "BuildTech Co.",
      "milestone": "M-05 Raft foundation poured", "raised": "2025-12-02",
      "claimed": 95000000, "verifiedBy": "Ledger Quantity Surveyors", "verifiedOn": "2025-12-09",
      "verifiedRef": "VR-121", "verified": 92000000, "approved": 92000000,
      "retentionRate": 5, "retention": 0, "released": 0, "paid": 0, "paidOn": "2025-12-23", "state": "Paid"
    },
    {
      "id": "PC-003", "packageId": "PR-003", "contractor": "National Steel Co.",
      "milestone": "M-02 Steel fabrication released", "raised": "2026-01-08",
      "claimed": 78000000, "verifiedBy": "Ledger Quantity Surveyors", "verifiedOn": "2026-01-15",
      "verifiedRef": "VR-126", "verified": 76000000, "approved": 76000000,
      "retentionRate": 5, "retention": 0, "released": 0, "paid": 0, "paidOn": "2026-01-29", "state": "Paid"
    },
    {
      "id": "PC-004", "packageId": "PR-004", "contractor": "Electro Mechanical Co.",
      "milestone": "M-04 Riser installation, levels 1-8", "raised": "2026-02-03",
      "claimed": 88000000, "verifiedBy": "Ledger Quantity Surveyors", "verifiedOn": "2026-02-11",
      "verifiedRef": "VR-131", "verified": 84000000, "approved": 84000000,
      "retentionRate": 5, "retention": 0, "released": 0, "paid": 0, "paidOn": "2026-02-24", "state": "Paid"
    },
    {
      "id": "PC-005", "packageId": "PR-005", "contractor": "AluTech Facades",
      "milestone": "M-01 Mock-up panel approved", "raised": "2026-02-17",
      "claimed": 34000000, "verifiedBy": "Ledger Quantity Surveyors", "verifiedOn": "2026-02-25",
      "verifiedRef": "VR-134", "verified": 33000000, "approved": 33000000,
      "retentionRate": 10, "retention": 0, "released": 0, "paid": 0, "paidOn": "2026-03-10", "state": "Paid"
    },
    {
      "id": "PC-006", "packageId": "PR-011", "contractor": "ABC PMC",
      "milestone": "Q4 2025 management fee", "raised": "2026-01-05",
      "claimed": 14000000, "verifiedBy": "Tazayud PMO", "verifiedOn": "2026-01-09",
      "verifiedRef": "VR-124", "verified": 14000000, "approved": 14000000,
      "retentionRate": 0, "retention": 0, "released": 0, "paid": 0, "paidOn": "2026-01-20", "state": "Paid"
    },
    {
      "id": "PC-007", "packageId": "PR-006", "contractor": "KONE Middle East",
      "milestone": "M-02 Hoistway equipment delivered", "raised": "2026-03-04",
      "claimed": 23000000, "verifiedBy": "Ledger Quantity Surveyors", "verifiedOn": "2026-03-12",
      "verifiedRef": "VR-139", "verified": 22500000, "approved": 22500000,
      "retentionRate": 5, "retention": 0, "released": 0, "paid": 0, "paidOn": "2026-03-25", "state": "Paid"
    },
    {
      "id": "PC-008", "packageId": "PR-012", "contractor": "Studio Qadr Architects",
      "milestone": "Stage 4 deliverables issued", "raised": "2026-03-09",
      "claimed": 9500000, "verifiedBy": "Tazayud PMO", "verifiedOn": "2026-03-16",
      "verifiedRef": "VR-141", "verified": 9100000, "approved": 9100000,
      "retentionRate": 0, "retention": 0, "released": 0, "paid": 0, "paidOn": "2026-03-30", "state": "Paid"
    },
    {
      "id": "PC-009", "packageId": "PR-009", "contractor": "GreenScape Co.",
      "milestone": "M-01 Site clearance and topsoil", "raised": "2026-04-06",
      "claimed": 7600000, "verifiedBy": "Ledger Quantity Surveyors", "verifiedOn": "2026-04-14",
      "verifiedRef": "VR-146", "verified": 7200000, "approved": 7200000,
      "retentionRate": 5, "retention": 0, "released": 0, "paid": 0, "paidOn": "2026-04-28", "state": "Paid"
    },
    {
      "id": "PC-010", "packageId": "PR-007", "contractor": "Daikin Gulf",
      "milestone": "M-03 Chiller units delivered to site", "raised": "2026-04-20",
      "claimed": 16000000, "verifiedBy": "Ledger Quantity Surveyors", "verifiedOn": "2026-04-29",
      "verifiedRef": "VR-149", "verified": 15200000, "approved": 15200000,
      "retentionRate": 5, "retention": 0, "released": 0, "paid": 0, "paidOn": null, "state": "Approved"
    },
    {
      "id": "PC-011", "packageId": "PR-002", "contractor": "BuildTech Co.",
      "milestone": "M-06 Basement slab, zones A and B", "raised": "2026-05-05",
      "claimed": 58400000, "verifiedBy": "Ledger Quantity Surveyors", "verifiedOn": "2026-05-14",
      "verifiedRef": "VR-152", "verified": 55100000, "approved": null,
      "retentionRate": 5, "retention": 0, "released": 0, "paid": 0, "paidOn": null, "state": "With approver"
    },
    {
      "id": "PC-012", "packageId": "PR-004", "contractor": "Electro Mechanical Co.",
      "milestone": "M-05 Riser installation, levels 9-16", "raised": "2026-05-21",
      "claimed": 22900000, "verifiedBy": null, "verifiedOn": null,
      "verifiedRef": null, "verified": null, "approved": null,
      "retentionRate": 5, "retention": 0, "released": 0, "paid": 0, "paidOn": null, "state": "With consultant"
    },
    {
      "id": "PC-013", "packageId": "PR-003", "contractor": "National Steel Co.",
      "milestone": "M-03 Erection, grid lines 1-6", "raised": "2026-05-28",
      "claimed": 41000000, "verifiedBy": null, "verifiedOn": null,
      "verifiedRef": null, "verified": null, "approved": null,
      "retentionRate": 5, "retention": 0, "released": 0, "paid": 0, "paidOn": null, "state": "With consultant"
    }
  ]
};
