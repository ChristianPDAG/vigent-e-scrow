/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/workspace.json`.
 */
export type Workspace = {
  "address": "GJpDE682RqjTKT75Hjii3KqUaW5ddhwqLWy1afH4XR5u",
  "metadata": {
    "name": "workspace",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "cancelBeforeFunding",
      "discriminator": [
        197,
        7,
        223,
        222,
        242,
        87,
        53,
        35
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "depositor",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "confirmReleaseAsDepositor",
      "discriminator": [
        154,
        77,
        195,
        106,
        207,
        242,
        90,
        29
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.depositor",
                "account": "escrowAccount"
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "depositor",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "sessionHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "confirmReleaseAsReceiver",
      "discriminator": [
        111,
        21,
        163,
        127,
        223,
        183,
        174,
        129
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.depositor",
                "account": "escrowAccount"
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "receiver",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "sessionHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "depositorToken",
          "writable": true
        },
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "finalizeRelease",
      "discriminator": [
        133,
        95,
        4,
        17,
        103,
        213,
        141,
        58
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "escrow.depositor",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.depositor",
                "account": "escrowAccount"
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "escrow.depositor",
                "account": "escrowAccount"
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "receiverToken",
          "writable": true
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "feeBps",
          "type": "u16"
        },
        {
          "name": "treasury",
          "type": "pubkey"
        },
        {
          "name": "arbiter",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "initializeEscrow",
      "discriminator": [
        243,
        160,
        77,
        153,
        11,
        92,
        48,
        209
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              },
              {
                "kind": "arg",
                "path": "escrowId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              },
              {
                "kind": "arg",
                "path": "escrowId"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "escrowId",
          "type": "u64"
        },
        {
          "name": "receiver",
          "type": "pubkey"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "expiresAt",
          "type": "i64"
        }
      ]
    },
    {
      "name": "openDispute",
      "discriminator": [
        137,
        25,
        99,
        119,
        23,
        223,
        161,
        42
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.depositor",
                "account": "escrowAccount"
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "caller",
          "writable": true,
          "signer": true
        }
      ],
      "args": [
        {
          "name": "reason",
          "type": "u8"
        }
      ]
    },
    {
      "name": "refundAfterExpiry",
      "discriminator": [
        210,
        2,
        52,
        232,
        49,
        218,
        178,
        59
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "depositorToken",
          "writable": true
        },
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "resolveDispute",
      "discriminator": [
        231,
        6,
        202,
        6,
        96,
        103,
        12,
        230
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "escrow.depositor",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.depositor",
                "account": "escrowAccount"
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "escrow.depositor",
                "account": "escrowAccount"
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "receiverToken",
          "writable": true
        },
        {
          "name": "depositorToken",
          "writable": true
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "arbiter",
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "resolveInFavorOfReceiver",
          "type": "bool"
        }
      ]
    },
    {
      "name": "startReleaseSession",
      "discriminator": [
        54,
        124,
        43,
        251,
        86,
        95,
        130,
        22
      ],
      "accounts": [
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.depositor",
                "account": "escrowAccount"
              },
              {
                "kind": "account",
                "path": "escrow.escrow_id",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "caller",
          "writable": true,
          "signer": true
        }
      ],
      "args": [
        {
          "name": "sessionHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "sessionExpiresAt",
          "type": "i64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "escrowAccount",
      "discriminator": [
        36,
        69,
        48,
        18,
        128,
        225,
        125,
        135
      ]
    }
  ],
  "events": [
    {
      "name": "configInitialized",
      "discriminator": [
        181,
        49,
        200,
        156,
        19,
        167,
        178,
        91
      ]
    },
    {
      "name": "disputeOpened",
      "discriminator": [
        239,
        222,
        102,
        235,
        193,
        85,
        1,
        214
      ]
    },
    {
      "name": "disputeResolved",
      "discriminator": [
        121,
        64,
        249,
        153,
        139,
        128,
        236,
        187
      ]
    },
    {
      "name": "escrowCancelled",
      "discriminator": [
        98,
        241,
        195,
        122,
        213,
        0,
        162,
        161
      ]
    },
    {
      "name": "escrowCreated",
      "discriminator": [
        70,
        127,
        105,
        102,
        92,
        97,
        7,
        173
      ]
    },
    {
      "name": "escrowFinalized",
      "discriminator": [
        211,
        238,
        67,
        24,
        96,
        136,
        203,
        95
      ]
    },
    {
      "name": "escrowRefunded",
      "discriminator": [
        132,
        209,
        49,
        109,
        135,
        138,
        28,
        81
      ]
    },
    {
      "name": "fundsDeposited",
      "discriminator": [
        157,
        209,
        100,
        95,
        59,
        100,
        3,
        68
      ]
    },
    {
      "name": "releaseConfirmed",
      "discriminator": [
        246,
        75,
        82,
        230,
        221,
        220,
        198,
        154
      ]
    },
    {
      "name": "releaseSessionStarted",
      "discriminator": [
        219,
        144,
        24,
        89,
        192,
        55,
        173,
        191
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "mathOverflow",
      "msg": "Math overflow occurred"
    },
    {
      "code": 6001,
      "name": "unauthorized",
      "msg": "Unauthorized access"
    },
    {
      "code": 6002,
      "name": "configInactive",
      "msg": "Config is inactive or paused"
    },
    {
      "code": 6003,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6004,
      "name": "invalidParameter",
      "msg": "Invalid parameter"
    },
    {
      "code": 6005,
      "name": "invalidMint",
      "msg": "Invalid mint"
    },
    {
      "code": 6006,
      "name": "invalidStatus",
      "msg": "Invalid escrow status for this operation"
    },
    {
      "code": 6007,
      "name": "escrowExpired",
      "msg": "Escrow has expired"
    },
    {
      "code": 6008,
      "name": "notExpired",
      "msg": "Escrow has not expired yet"
    },
    {
      "code": 6009,
      "name": "sessionExpired",
      "msg": "Release session has expired"
    },
    {
      "code": 6010,
      "name": "invalidSessionHash",
      "msg": "Invalid session hash"
    },
    {
      "code": 6011,
      "name": "alreadyConfirmed",
      "msg": "Already confirmed release"
    },
    {
      "code": 6012,
      "name": "notFullyConfirmed",
      "msg": "Both parties must confirm before finalize"
    },
    {
      "code": 6013,
      "name": "notDisputed",
      "msg": "Escrow is not in disputed state"
    }
  ],
  "types": [
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "isPaused",
            "type": "bool"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "arbiter",
            "type": "pubkey"
          },
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "escrowCount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "configInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "arbiter",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "disputeOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": "u64"
          },
          {
            "name": "openedBy",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "disputeResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": "u64"
          },
          {
            "name": "resolvedBy",
            "type": "pubkey"
          },
          {
            "name": "inFavorOfReceiver",
            "type": "bool"
          },
          {
            "name": "depositor",
            "type": "pubkey"
          },
          {
            "name": "receiver",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "escrowAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": "u64"
          },
          {
            "name": "depositor",
            "type": "pubkey"
          },
          {
            "name": "receiver",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "escrowStatus"
              }
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "depositorReleased",
            "type": "bool"
          },
          {
            "name": "receiverReleased",
            "type": "bool"
          },
          {
            "name": "releaseSessionHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "sessionExpiresAt",
            "type": "i64"
          },
          {
            "name": "disputeReason",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "escrowCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": "u64"
          },
          {
            "name": "cancelledBy",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "escrowCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": "u64"
          },
          {
            "name": "depositor",
            "type": "pubkey"
          },
          {
            "name": "receiver",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "escrowFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": "u64"
          },
          {
            "name": "receiver",
            "type": "pubkey"
          },
          {
            "name": "amountNet",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "releasedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "escrowRefunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": "u64"
          },
          {
            "name": "depositor",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "refundedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "escrowStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "created"
          },
          {
            "name": "funded"
          },
          {
            "name": "releaseStarted"
          },
          {
            "name": "released"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "disputed"
          },
          {
            "name": "expired"
          }
        ]
      }
    },
    {
      "name": "fundsDeposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": "u64"
          },
          {
            "name": "depositor",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "fundedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "releaseConfirmed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": "u64"
          },
          {
            "name": "confirmer",
            "type": "pubkey"
          },
          {
            "name": "isDepositor",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "releaseSessionStarted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": "u64"
          },
          {
            "name": "sessionHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "sessionExpiresAt",
            "type": "i64"
          },
          {
            "name": "initiatedBy",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};