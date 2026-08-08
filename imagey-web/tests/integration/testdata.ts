import { mockDocuments } from "./mockDocuments.ts";

export interface TestDevice {
  deviceId: string;
  publicDeviceKey?: JsonWebKey;
  encryptedPrivateDeviceKey: string;
  encryptedPrivateMainKey?: string;
}

export interface TestChat {
  contactEmail: string;
  encryptedSharedKey: string;
  messages: { id: string; content: string }[];
}

export interface TestDocument {
  documentId: string;
  name: string;
  metadata?: string;
}

export interface TestUser<
  TDevices extends TestDevice[] = TestDevice[],
  TDocs extends TestDocument[] = TestDocument[],
> {
  password: string;
  settings?: Record<string, string>;
  publicMainKey: JsonWebKey;
  privateMainKey?: JsonWebKey;
  devices: TDevices;
  documents: TDocs;
  chats?: TestChat[];
}

export interface TestDataStructure {
  mary: TestUser<
    [TestDevice, TestDevice],
    [TestDocument, TestDocument, TestDocument, TestDocument]
  >;
  alice: TestUser<
    [TestDevice, TestDevice],
    [TestDocument, TestDocument, TestDocument]
  >;
  laura: TestUser<[TestDevice], [TestDocument, TestDocument, TestDocument]>;
  bill: TestUser<[TestDevice], [TestDocument, TestDocument, TestDocument]>;
  joe: TestUser<[TestDevice, TestDevice], []>;
}

export const TestData: TestDataStructure = {
  mary: {
    password: "MarysPassword123",
    settings: {
      documents: "68980188-577d-4d2f-9e36-a6b32b25cd3a",
      chats: "9c59a4f3-ae55-4c4b-9e4a-2079a2446738",
      profile: "9b71fa98-8616-4222-b03e-d189289ccbd0",
    },
    publicMainKey: {
      crv: "P-256",
      ext: true,
      key_ops: [],
      kty: "EC",
      x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
      y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
    },
    privateMainKey: {
      crv: "P-256",
      d: "9of9zCwj6wFarMtSDdsp_4K_q2g2g_nv2jQgrTBQ4fw",
      ext: true,
      key_ops: ["deriveKey"],
      kty: "EC",
      x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
      y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
    },
    devices: [
      {
        deviceId: "1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c",
        encryptedPrivateMainKey:
          "Xn3EJRWvHA+Y+2wDyoM/ICeuPIHL8T2t3KXBQBfmw3ZUt60ROTOLWU6iXwlDWRTDi/kYXj29cY7lHE3yse6mneYSZLipfVxi5JYyi/Ocqx3bc/8fjuhKs1RnMMyvKJa2XoVf5G02gHdOvt4Eoh13nNfEXbzbqyrXybZPxOiKw7ozyMU8+7PIHSLrPtA9cprS1Mju8aus1FEtdD9hFXWFJ2nz8d3PhLu+sRdmRafIZNksou8hlcKxBuS+aEvQ02KXPcGP5muGPHBYRLHbq+Ilw5RGF1Id2Z8HFdENPXijLjzy6V/zSsYrUfIxdT0p6sE=",
        publicDeviceKey: {
          crv: "P-256",
          ext: true,
          key_ops: [],
          kty: "EC",
          x: "O1aGIpmfLo-SOJDBwBW1zyKJDUdIxpmYjg-vC8UTim4",
          y: "ySJAF_0XeBWOrL-jboQvxy644ViTd0FDgp-pSCP3ONU",
        },
        encryptedPrivateDeviceKey:
          "0ELBtGbQUw3aaiNvOWSDVy3IrqGC09HiTC1LenPFGl2i5iAmk1VkehcKwUP5VGMf0P1qZvmrgaM/Ov/ozxN5lo1Kmjpg8P/lQQ1U5hSneCBeXVSG+rzwD7OwsAbWKsut/lkl39YYPcwELKizYKbPw7Aq3rZmpuV/KOL/ixuM7CP/SCCmgpdkgmLCdfxw8OAFJv4kDbSCJyzmMXb+ehiJ6x3YvtoJrlZBBSTOir6i5T39iWr8jHrzmG3bnTsWG7yf/ZRZSPqnZc1LXN0Pgi2WPV6p/iK9TpN2WLhYFY/yJdU1H414XUTm4O6GCcfGXsowXkEkEnInHvcizftIKgcc",
      },
      {
        deviceId: "00b7d225-202c-4ab9-8efc-36e6f3afb169",
        encryptedPrivateMainKey:
          "aVvCK4w3ylq9a46xj/FERQDs8+gbDF30CVz0Vw+Egd3TuBR32quTnJC/MRtetpZ1a6FpQ/Otu2nlGW07t+N9SAHOCl4CYg9l8jFPqOnyeClBiyIpR2XLRK0QkZv3ugI2JafSUt7h9O1JcqpyF3LyKbzU/Sq6/swe6bVA5KJ+fWlA4cA/oKQJdhS0a8FAqieQuYW7CXZTKOG07gKb0QLsBVLt6v1aW043zfOfQrvEaswEXV3ZtLV+OEZFHxGUAmueoOC5Rse9Y0Z9Z8LmswX3YCrKGheyk1leLo6Nv3HxDYYDYulndoDIzqxdjic6P00=",
        publicDeviceKey: {
          key_ops: [],
          ext: true,
          kty: "EC",
          x: "vw3r0fNgUJcClYS2tYjGslOYu0JL9J7HzYRCDaU_rY0",
          y: "xaFiT25PZOLBxQbHex0uWBH1Uzh2rSPQMqbd8u0P51s",
          crv: "P-256",
        },
        encryptedPrivateDeviceKey:
          "oPsFWEcpXVvKXCL0Jx6n98LqmxLNrN+GXCITeDJt93BEXSdshy1HgMtpvCdAzIVd3TDgIV9dSga8zndT0fl38YDG7nFDkGAS1pj+7RZH5eiIjSSSCVdOvxTcMtS1v97s9mg22g+Hk0Ajr2M4xayA0Mkmztu6AzuKVeKmLoCuZrQzS+ZpVBbYKRuhgRuXMJMPFMFhDhTfyDVOrss+qXmmzv+2JWTaX5qS+xMK10/ko1rBH6gD5Lc2E11uhkT7XBF7w32G1vycNwtlTSLbcQ3pdNxwXoROskP+48Ph67ujqPCQ5R+43eKsmHuvnOWZ+Cg0SL1YvJjFXTAoLdBNF2Pe",
      },
    ],
    documents: [
      {
        documentId: "945331a6-b9a8-4f88-a5f5-5928bcdf2fdb",
        name: "child-355176_1920.jpg",
        metadata:
          "WK8Fu/50nR9I/whZjbqsEcQkgP2h6/TAzvbxkaOcVfp8ElHQLoKXgdV0STrYeui9EEjH2AbMq4T6De6xTGVyqpvFjWRjOAvgWmxKv2tFUiI9b3RNsJoUBlbZutw5RRSY+JzERZ6VNpLhSJNn568YT+di3o8ca7w39bx8xIoNimYvb/rTB8nLoM1LY6cjf99dOP1In+GYjBRkDeqouKOqpH1jvx4V5fOxSrNQCOF3u5zmsnupYVeatjPrq9k/6xytM+XQClVfOBK4Xa1ZpGkD5hpqNlC8JNJwjqyynRUw0bGrMJcg+cb1GnKrGsM9j0N3jnseQGNLNgssmObkUL3umrU=",
      },
      {
        documentId: "78d1b093-45ec-4a25-9594-615ca2d70ba2",
        name: "beach-4524911_480.jpg",
        metadata:
          "qvLFOjMio9UXlH15L4G//nDgtZiCRmOirewJIKlLvCfvwKSRJUOOsU1aU/PjuQ2LfN2qkUVerEthue3531l2oiB2U08PfHTp6INL8SiAbCcuYVxajjuXWL+BhQX24LYK8EVpLSW/jQRneclFmDEoUETJ8kLllnyISL/FADoZbd46SfIVrf/U9ijxemJZQrQ6y6D3/wAoNyn2lOC93bO7m8ZyIWYQ4z264o98ykNsD5n+Kpq4IoOuw0YZHIBfYRp/dlm1Xo9TedKs14F1h02DgN0QKeA7Fdl2P8nPshB2R61lHUQpNYV12DV27KBvefdPtRXAS73ACmhxbtgg+PVZkQ==",
      },
      {
        documentId: "profile",
        name: "profile.json",
        metadata:
          "xClE2qirS+J/0WwxlwX6wjxIIhhjC72ezWzTHkPlkYHOTJDIQuWp5TKuu9cgwkzbZqD63Jc+Ao7fKcKhDYNsJI81WU8FRwoN/8uuxnqKpLc+B30RNc/e",
      },
      {
        documentId: "profile-pic-doc-id",
        name: "profile.jpg",
        metadata:
          "QIJNho2eMgtb/C1BukR6F8OXQY2v6/9WUKQ7bIko5WqhAI52uJmXTuIYIQEV+eLwLykoFwoO9VoYzvjPaUJ6P7iMuBEdok7GmTzINz182BYeZBms",
      },
    ],
    chats: [
      {
        contactEmail: "laura@imagey.cloud",
        encryptedSharedKey:
          "WPBJTuiZwokG7UKTcmZEdRPQOT+f0ytpVeFms2M0iPBUInOShgWt2EcNbiyLW1UVvF3IFKnmxQxOvSnRXLoOOrjuCubivIbTvxOh0mM650TCiTrqeDilOquIUX/ZykGyNt2QN/o0UCe1p6oc64NdmdfVjc9bFOzH9dUTk46od+wYrzzlKRj+NIhbRXY2JZ6MK/vrWitf",
        messages: [
          {
            id: "msg-123",
            content:
              "HW8URzE9G7o/muIVmhdpPBTsmui7mlYyDmx5+d2l28tcQbJV2FXPf3e/jgZYP2Qpj70kqN7H",
          },
        ],
      },
      {
        contactEmail: "alice@imagey.cloud",
        encryptedSharedKey:
          "WPBJTuiZwokG7UKTcmZEdRPQOT+f0ytpVeFms2M0iPBUInOShgWt2EcNbiyLW1UVvF3IFKnmxQxOvSnRXLoOOrjuCubivIbTvxOh0mM650TCiTrqeDilOquIUX/ZykGyNt2QN/o0UCe1p6oc64NdmdfVjc9bFOzH9dUTk46od+wYrzzlKRj+NIhbRXY2JZ6MK/vrWitf",
        messages: [],
      },
    ],
  },
  alice: {
    password: "AlicesPassword",
    settings: {
      documents: "7ca8742e-821f-4276-862d-d5d2dbd42038",
      documentListId: "7ca8742e-821f-4276-862d-d5d2dbd42038",
      chatListId: "09128665-7ebf-426f-95fe-84f31ac53167",
      chatFolder: "09128665-7ebf-426f-95fe-84f31ac53167",
      profileId: "15917f2b-220c-4ecb-a08b-fb3a695b4424",
      profilePicDocumentId: "8e1ff0be-5c0e-40af-9f39-35ed57c8f1fb",
    },
    publicMainKey: {
      key_ops: [],
      ext: true,
      kty: "EC",
      x: "WlNo3xHpsegk3jRU8hZAX1lLtpreYYr56KKo7oAk1W8",
      y: "jXAPNGWZAQzHggF9gg15pov1GjPh_lPw-8VIeLIGQaM",
      crv: "P-256",
    },
    privateMainKey: {
      key_ops: ["deriveKey"],
      ext: true,
      kty: "EC",
      x: "WlNo3xHpsegk3jRU8hZAX1lLtpreYYr56KKo7oAk1W8",
      y: "jXAPNGWZAQzHggF9gg15pov1GjPh_lPw-8VIeLIGQaM",
      crv: "P-256",
      d: "fSA4NOX9E_nZksg8nxTKZ1_Gga2sF5d77ycfifX3xKE",
    },
    devices: [
      {
        deviceId: "1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c",
        encryptedPrivateMainKey:
          "Xn3EJRWvHA+Y+2wDyoM/ICeuPIHL8T2t3KXBQBfmw3ZUt60ROTOLWU6iXwlDWRTDi/kYXj29cY7lHE3yse6mneYSZLipfVxi5JYyi/Ocqx3bc/8fjuhKs1RnMMyvKJa2XoVf5G02gHdOvt4Eoh13nNfEXbzbqyrXybZPxOiKw7ozyMU8+7PIHSLrPtA9cprS1Mju8aus1FEtdD9hFXWFJ2nz8d3PhLu+sRdmRafIZNksou8hlcKxBuS+aEvQ02KXPcGP5muGPHBYRLHbq+Ilw5RGF1Id2Z8HFdENPXijLjzy6V/zSsYrUfIxdT0p6sE=",
        publicDeviceKey: {
          crv: "P-256",
          ext: true,
          key_ops: [],
          kty: "EC",
          x: "O1aGIpmfLo-SOJDBwBW1zyKJDUdIxpmYjg-vC8UTim4",
          y: "ySJAF_0XeBWOrL-jboQvxy644ViTd0FDgp-pSCP3ONU",
        },
        encryptedPrivateDeviceKey:
          "0ELBtGbQUw3aaiNvOWSDVy3IrqGC09HiTC1LenPFGl2i5iAmk1VkehcKwUP5VGMf0P1qZvmrgaM/Ov/ozxN5lo1Kmjpg8P/lQQ1U5hSneCBeXVSG+rzwD7OwsAbWKsut/lkl39YYPcwELKizYKbPw7Aq3rZmpuV/KOL/ixuM7CP/SCCmgpdkgmLCdfxw8OAFJv4kDbSCJyzmMXb+ehiJ6x3YvtoJrlZBBSTOir6i5T39iWr8jHrzmG3bnTsWG7yf/ZRZSPqnZc1LXN0Pgi2WPV6p/iK9TpN2WLhYFY/yJdU1H414XUTm4O6GCcfGXsowXkEkEnInHvcizftIKgcc",
      },
      {
        deviceId: "00b7d225-202c-4ab9-8efc-36e6f3afb169",
        encryptedPrivateMainKey:
          "aVvCK4w3ylq9a46xj/FERQDs8+gbDF30CVz0Vw+Egd3TuBR32quTnJC/MRtetpZ1a6FpQ/Otu2nlGW07t+N9SAHOCl4CYg9l8jFPqOnyeClBiyIpR2XLRK0QkZv3ugI2JafSUt7h9O1JcqpyF3LyKbzU/Sq6/swe6bVA5KJ+fWlA4cA/oKQJdhS0a8FAqieQuYW7CXZTKOG07gKb0QLsBVLt6v1aW043zfOfQrvEaswEXV3ZtLV+OEZFHxGUAmueoOC5Rse9Y0Z9Z8LmswX3YCrKGheyk1leLo6Nv3HxDYYDYulndoDIzqxdjic6P00=",
        publicDeviceKey: {
          key_ops: [],
          ext: true,
          kty: "EC",
          x: "vw3r0fNgUJcClYS2tYjGslOYu0JL9J7HzYRCDaU_rY0",
          y: "xaFiT25PZOLBxQbHex0uWBH1Uzh2rSPQMqbd8u0P51s",
          crv: "P-256",
        },
        encryptedPrivateDeviceKey:
          "oPsFWEcpXVvKXCL0Jx6n98LqmxLNrN+GXCITeDJt93BEXSdshy1HgMtpvCdAzIVd3TDgIV9dSga8zndT0fl38YDG7nFDkGAS1pj+7RZH5eiIjSSSCVdOvxTcMtS1v97s9mg22g+Hk0Ajr2M4xayA0Mkmztu6AzuKVeKmLoCuZrQzS+ZpVBbYKRuhgRuXMJMPFMFhDhTfyDVOrss+qXmmzv+2JWTaX5qS+xMK10/ko1rBH6gD5Lc2E11uhkT7XBF7w32G1vycNwtlTSLbcQ3pdNxwXoROskP+48Ph67ujqPCQ5R+43eKsmHuvnOWZ+Cg0SL1YvJjFXTAoLdBNF2Pe",
      },
    ],
    documents: [
      {
        documentId: "7ca8742e-821f-4276-862d-d5d2dbd42038",
        name: "root",
        metadata: mockDocuments.alice.rootFolder.metadata,
      },
      {
        documentId: "15917f2b-220c-4ecb-a08b-fb3a695b4424",
        name: "profile.json",
        metadata: mockDocuments.alice.profile.metadata,
      },
      {
        documentId: "8e1ff0be-5c0e-40af-9f39-35ed57c8f1fb",
        name: "profile.jpg",
        metadata: mockDocuments.alice.profilePic.metadata,
      },
    ],
    chats: [
      {
        contactEmail: "laura@imagey.cloud",
        encryptedSharedKey:
          "WPBJTuiZwokG7UKTcmZEdRPQOT+f0ytpVeFms2M0iPBUInOShgWt2EcNbiyLW1UVvF3IFKnmxQxOvSnRXLoOOrjuCubivIbTvxOh0mM650TCiTrqeDilOquIUX/ZykGyNt2QN/o0UCe1p6oc64NdmdfVjc9bFOzH9dUTk46od+wYrzzlKRj+NIhbRXY2JZ6MK/vrWitf",
        messages: [
          {
            id: "msg-123",
            content:
              "HW8URzE9G7o/muIVmhdpPBTsmui7mlYyDmx5+d2l28tcQbJV2FXPf3e/jgZYP2Qpj70kqN7H",
          },
        ],
      },
      {
        contactEmail: "alice@imagey.cloud",
        encryptedSharedKey:
          "WPBJTuiZwokG7UKTcmZEdRPQOT+f0ytpVeFms2M0iPBUInOShgWt2EcNbiyLW1UVvF3IFKnmxQxOvSnRXLoOOrjuCubivIbTvxOh0mM650TCiTrqeDilOquIUX/ZykGyNt2QN/o0UCe1p6oc64NdmdfVjc9bFOzH9dUTk46od+wYrzzlKRj+NIhbRXY2JZ6MK/vrWitf",
        messages: [],
      },
    ],
  },
  laura: {
    password: "LaurasPassword123",
    settings: {
      documents: "fa2f1875-d2d1-4706-94f7-ba69880578e7",
      documentListId: "fa2f1875-d2d1-4706-94f7-ba69880578e7",
      chatListId: "8d54110e-5ff5-4f78-a9d3-73e08393339a",
      chatFolder: "8d54110e-5ff5-4f78-a9d3-73e08393339a",
      profileId: "f3ed850d-4813-439b-a1c8-5a1d9a06fe24",
      profilePicDocumentId: "59197529-6431-478e-a166-adcef68c1f27",
    },
    publicMainKey: {
      key_ops: [],
      ext: true,
      kty: "EC",
      x: "dPd7doWoBiUEsALGowG_YbdvFvoPTgZcu-yo3xMhvko",
      y: "Ao1YeaTCJxqT0tEdp06Qk_rDLc6DvFkesV_49HQgCAY",
      crv: "P-256",
    },
    privateMainKey: {
      key_ops: ["deriveKey"],
      ext: true,
      kty: "EC",
      x: "dPd7doWoBiUEsALGowG_YbdvFvoPTgZcu-yo3xMhvko",
      y: "Ao1YeaTCJxqT0tEdp06Qk_rDLc6DvFkesV_49HQgCAY",
      crv: "P-256",
      d: "MQ7zU77IfPN55gt8MZ-1tjADmeVkvsxrKzs5amcJx2U",
    },
    devices: [
      {
        deviceId: "4fe915c1-4d51-4d68-b6f5-9799b4892672",
        encryptedPrivateMainKey:
          "3fFN4nh0GwK8j2oemJ3yAGlU+y1n9hIe5+KZUd3ROYRy19Vup2PHnrevDP6Dy6DOrOBI6oJhlnHeIJFSVGiUjQQbdbUAi7+WJ/Fvv5L2N4AE5a35oLddysjGjY1reBnhBqLJUAYb/YYP8IH2rDJ/B2MieH/wQ10BqBJN4oXqP39dNiokFItGz5QqS82G2IrwnwEMJhTxR7H0mNW0hi6n93q94YzHrt/KgTKObn/fmsn3FoxqUXaKWhbdjuuC3wisJPYvYPcVQbFWS469wb/umPkltVvFpaf7CYZ9d/TgWAwOF/SdDPn3W85yqH1adzI=",
        encryptedPrivateDeviceKey:
          "nzTrK2m23cQeO81zxJkQK5gCh27IkvPhl3oxDjAtUnjEa1O/B1wQMWCiQi0GZj8gjrrpgxsv4A21SfNmLlO8BBKv1XNnEM1B59ORa8KvKY8cHPR4H2HWlK4JRu77mo2wvmBtGd7Us7tK3noXaZJr8lrHf3G5Eotxc751vYPzcOlCgIG/ZiUl7Nz+Tb/UFsrSTWbTz37bcUJMtghdgepcuCZ9hQzHaqRDMliH0HiK3X/V3C+ohANwYpgMS/cvIUK8zOjxzO6r1KXugbUYBjujJWK1y5Z8X96TP/PmazPxpeGV29IJgXrMBYoTkcESj8jdMS/IpW6nAfBgErQTW+IZ",
        publicDeviceKey: {
          crv: "P-256",
          ext: true,
          key_ops: [],
          kty: "EC",
          x: "HQ0gUOYivOstlGIUOnppUuyYcB4InX7pzwTjzN4Jbq0",
          y: "g3sYZl7q_gt-oV5hXLuqt-TEnXZ8AB5pdMXRAGrkddg",
        },
      },
    ],
    documents: [
      {
        documentId: "fa2f1875-d2d1-4706-94f7-ba69880578e7",
        name: "root",
        metadata: mockDocuments.laura.rootFolder.metadata,
      },
      {
        documentId: "f3ed850d-4813-439b-a1c8-5a1d9a06fe24",
        name: "profile.json",
        metadata: mockDocuments.laura.profile.metadata,
      },
      {
        documentId: "59197529-6431-478e-a166-adcef68c1f27",
        name: "profile.jpg",
        metadata: mockDocuments.laura.profilePic.metadata,
      },
    ],
  },
  bill: {
    password: "BillsPassword123",
    settings: {
      documents: "a2fdae4a-fac3-4d20-bfca-7c34146f8587",
      documentListId: "a2fdae4a-fac3-4d20-bfca-7c34146f8587",
      chatListId: "28f136c4-394a-416a-8f47-10f844b47ac5",
      chatFolder: "28f136c4-394a-416a-8f47-10f844b47ac5",
      profileId: "d841a46e-1522-4af8-8063-e1bb1e9585ed",
      profilePicDocumentId: "3122289e-dd5d-4017-b3d0-cc1e96b5f470",
    },
    publicMainKey: {
      key_ops: [],
      ext: true,
      kty: "EC",
      x: "47SNY_Yfv3G16-udPCN0S6x_wi2YyQ3CKuoaGujUa9k",
      y: "lWPtfRADuCiZ0YiAfteHLtsP5zqbtvwnoeOmavdXE58",
      crv: "P-256",
    },
    privateMainKey: {
      key_ops: ["deriveKey"],
      ext: true,
      kty: "EC",
      x: "47SNY_Yfv3G16-udPCN0S6x_wi2YyQ3CKuoaGujUa9k",
      y: "lWPtfRADuCiZ0YiAfteHLtsP5zqbtvwnoeOmavdXE58",
      crv: "P-256",
      d: "Bl5oD5DrxFqJEk6euTTkoUu1f_vkwb5G_GS4Uo3_ZB4",
    },
    devices: [
      {
        deviceId: "ea87fc9d-c670-4809-8536-4e379e54d6c0",
        encryptedPrivateMainKey:
          "JpWIxE9hXL/nSK3tdXLm4tR/wZ13dQChY4bPLYf0w01J01QT8xrtLaHUUK0El9OstOC8k3FD+FBOu2P0ADmF0J006oVm83a1IJgoBVOMaAbAX4opoPCUpGaGPIrIQQ7jQOH7GvbkupcIC8EB7AQZMSLpddyh/XFxfurbI0pDN8Exz5K0DAdtSubn3ZAo7se0WfPBX4vav9wFpKCaNB+1gnFYMTDliZmBTpLbI3iV3aV26cvJcEr517nmShDGh5QMW+xZtWLkrkZ4TLJzTN4fp3U0l2yZ90kNbcQjGDKI+hIBkzcMHLJuidkbDoAif7k=",
        encryptedPrivateDeviceKey:
          "72nn+8xeZPSKiSnCjamq0gawEIc6xeaN/q4TFkLGmMrzZbVK72PUwLJGGPq6l8h3amCHDDOdv+ZTQXyBoRiSkLWUpB4hiXOj66KJO2ZlC+vDDfvbscRXhhisLDrZGlG0Xo9BW5W6pFj7vkJvaoOVFCfL0fIILwKwkbt6S1mAC9E3TqVf/1rb2uuFYBViSLZG3jf/j/zT25Yy1VT/c82pMjfEEIQ22VpShVA90JNt2MH56Q3G9xSLpWxVOT1hJqk/4e/G6IGFuVSHbbA5GytpcfSlysyvbjGsgNzV4LDoKFCltQmD4H4bD49sCKpo4CAwZlr3eR9jziWY24Oa7Zg0",
        publicDeviceKey: {
          crv: "P-256",
          ext: true,
          key_ops: [],
          kty: "EC",
          x: "oOZPWvQVeEcv5_eUfM8Y8EKVoyPB4brj2QbJJtgjraM",
          y: "AFZGG9fCP0bylriwAi_3uwYGw5qjE7oK1kifP8yAUYw",
        },
      },
    ],
    documents: [
      {
        documentId: "a2fdae4a-fac3-4d20-bfca-7c34146f8587",
        name: "root",
        metadata: mockDocuments.bill.rootFolder.metadata,
      },
      {
        documentId: "d841a46e-1522-4af8-8063-e1bb1e9585ed",
        name: "profile.json",
        metadata: mockDocuments.bill.profile.metadata,
      },
      {
        documentId: "3122289e-dd5d-4017-b3d0-cc1e96b5f470",
        name: "profile.jpg",
        metadata: mockDocuments.bill.profilePic.metadata,
      },
    ],
  },
  joe: {
    password: "MarysPassword123",
    publicMainKey: {
      crv: "P-256",
      ext: true,
      key_ops: [],
      kty: "EC",
      x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
      y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
    },
    privateMainKey: {
      crv: "P-256",
      d: "9of9zCwj6wFarMtSDdsp_4K_q2g2g_nv2jQgrTBQ4fw",
      ext: true,
      key_ops: ["deriveKey"],
      kty: "EC",
      x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
      y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
    },
    devices: [
      {
        deviceId: "1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c",
        encryptedPrivateMainKey:
          "Xn3EJRWvHA+Y+2wDyoM/ICeuPIHL8T2t3KXBQBfmw3ZUt60ROTOLWU6iXwlDWRTDi/kYXj29cY7lHE3yse6mneYSZLipfVxi5JYyi/Ocqx3bc/8fjuhKs1RnMMyvKJa2XoVf5G02gHdOvt4Eoh13nNfEXbzbqyrXybZPxOiKw7ozyMU8+7PIHSLrPtA9cprS1Mju8aus1FEtdD9hFXWFJ2nz8d3PhLu+sRdmRafIZNksou8hlcKxBuS+aEvQ02KXPcGP5muGPHBYRLHbq+Ilw5RGF1Id2Z8HFdENPXijLjzy6V/zSsYrUfIxdT0p6sE=",
        publicDeviceKey: {
          crv: "P-256",
          ext: true,
          key_ops: [],
          kty: "EC",
          x: "O1aGIpmfLo-SOJDBwBW1zyKJDUdIxpmYjg-vC8UTim4",
          y: "ySJAF_0XeBWOrL-jboQvxy644ViTd0FDgp-pSCP3ONU",
        },
        encryptedPrivateDeviceKey:
          "0ELBtGbQUw3aaiNvOWSDVy3IrqGC09HiTC1LenPFGl2i5iAmk1VkehcKwUP5VGMf0P1qZvmrgaM/Ov/ozxN5lo1Kmjpg8P/lQQ1U5hSneCBeXVSG+rzwD7OwsAbWKsut/lkl39YYPcwELKizYKbPw7Aq3rZmpuV/KOL/ixuM7CP/SCCmgpdkgmLCdfxw8OAFJv4kDbSCJyzmMXb+ehiJ6x3YvtoJrlZBBSTOir6i5T39iWr8jHrzmG3bnTsWG7yf/ZRZSPqnZc1LXN0Pgi2WPV6p/iK9TpN2WLhYFY/yJdU1H414XUTm4O6GCcfGXsowXkEkEnInHvcizftIKgcc",
      },
      {
        deviceId: "00b7d225-202c-4ab9-8efc-36e6f3afb169",
        encryptedPrivateMainKey:
          "aVvCK4w3ylq9a46xj/FERQDs8+gbDF30CVz0Vw+Egd3TuBR32quTnJC/MRtetpZ1a6FpQ/Otu2nlGW07t+N9SAHOCl4CYg9l8jFPqOnyeClBiyIpR2XLRK0QkZv3ugI2JafSUt7h9O1JcqpyF3LyKbzU/Sq6/swe6bVA5KJ+fWlA4cA/oKQJdhS0a8FAqieQuYW7CXZTKOG07gKb0QLsBVLt6v1aW043zfOfQrvEaswEXV3ZtLV+OEZFHxGUAmueoOC5Rse9Y0Z9Z8LmswX3YCrKGheyk1leLo6Nv3HxDYYDYulndoDIzqxdjic6P00=",
        publicDeviceKey: {
          key_ops: [],
          ext: true,
          kty: "EC",
          x: "vw3r0fNgUJcClYS2tYjGslOYu0JL9J7HzYRCDaU_rY0",
          y: "xaFiT25PZOLBxQbHex0uWBH1Uzh2rSPQMqbd8u0P51s",
          crv: "P-256",
        },
        encryptedPrivateDeviceKey:
          "oPsFWEcpXVvKXCL0Jx6n98LqmxLNrN+GXCITeDJt93BEXSdshy1HgMtpvCdAzIVd3TDgIV9dSga8zndT0fl38YDG7nFDkGAS1pj+7RZH5eiIjSSSCVdOvxTcMtS1v97s9mg22g+Hk0Ajr2M4xayA0Mkmztu6AzuKVeKmLoCuZrQzS+ZpVBbYKRuhgRuXMJMPFMFhDhTfyDVOrss+qXmmzv+2JWTaX5qS+xMK10/ko1rBH6gD5Lc2E11uhkT7XBF7w32G1vycNwtlTSLbcQ3pdNxwXoROskP+48Ph67ujqPCQ5R+43eKsmHuvnOWZ+Cg0SL1YvJjFXTAoLdBNF2Pe",
      },
    ],
    documents: [],
  },
};
