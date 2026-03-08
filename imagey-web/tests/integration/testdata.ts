export interface TestDevice {
  deviceId: string;
  publicDeviceKey?: JsonWebKey;
  encryptedPrivateDeviceKey: string;
  encryptedPrivateMainKey?: string;
}

export interface TestDocument {
  documentId: string;
  name: string;
}

export interface TestUser<
  TDevices extends TestDevice[] = TestDevice[],
  TDocs extends TestDocument[] = TestDocument[],
> {
  password: string;
  publicMainKey: JsonWebKey;
  privateMainKey?: JsonWebKey;
  encryptedPrivateMainKey?: string;
  devices: TDevices;
  documents: TDocs;
}

export interface TestDataStructure {
  mary: TestUser<[TestDevice, TestDevice], [TestDocument, TestDocument]>;
  alice: TestUser<[TestDevice], []>;
  bill: TestUser<[TestDevice], []>;
}

export const TestData: TestDataStructure = {
  mary: {
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
    documents: [
      {
        documentId: "945331a6-b9a8-4f88-a5f5-5928bcdf2fdb",
        name: "child-355176_1920.jpg",
      },
      {
        documentId: "78d1b093-45ec-4a25-9594-615ca2d70ba2",
        name: "beach-4524911_480.jpg",
      },
    ],
  },
  alice: {
    password: "alicesPassword",
    publicMainKey: {
      crv: "P-256",
      ext: true,
      key_ops: [],
      kty: "EC",
      x: "qifwej_FmWyOknQBQIKvyGyX_nxYJsdkVTe2XrfVdPI",
      y: "_87In1aaujLDD79RPFfSAuZ0nxzXGlelhETdkl7eRO4",
    },
    devices: [
      {
        deviceId: "300f192d-6ceb-4740-a65a-983c3965a16b",
        publicDeviceKey: {
          crv: "P-256",
          ext: true,
          key_ops: [],
          kty: "EC",
          x: "GPQeMUdXO5NSrwFtAwAJruqKcG-8gstfB6bcAnl-GKc",
          y: "3VuqEyR3ughswu1tSlA-uunbRSqi0RrRyFHt_zy3EuI",
        },
        encryptedPrivateDeviceKey:
          "tQphBfQkccgkUtZ8vB4kj1tMMgR6j1Mp1OEuAQC5ZE/zR58sXeuhJF9Is+GiuDaCtni8WjmvKtSy2rCB+N521ITnnkOkakw16y9Im0igzPY5bDsda7bznYX3wO7wORIgntsQihEQYfaPrMWT4Wxw5wW+SeftRNJeQTuKuwM4PwbhyGY2lSSavXh0LCcFJPcvzrXZLYQZF+OCrbg3vmFSJ0luVUuMock8HqgPljwHU7hA/N/YoCoCQl4YLKoG97F4Qz5+f61bw3e88lj/CMLJDLjKts5CgN6Cc7a3n7m2AVAaZeAsEHI0w9xAFYu9LdeVMxyVZM8P4nocKHzZQrRE",
      },
    ],
    documents: [],
  },
  bill: {
    password: "BillsPassword",
    encryptedPrivateMainKey:
      "JpWIxE9hXL/nSK3tdXLm4tR/wZ13dQChY4bPLYf0w01J01QT8xrtLaHUUK0El9OstOC8k3FD+FBOu2P0ADmF0J006oVm83a1IJgoBVOMaAbAX4opoPCUpGaGPIrIQQ7jQOH7GvbkupcIC8EB7AQZMSLpddyh/XFxfurbI0pDN8Exz5K0DAdtSubn3ZAo7se0WfPBX4vav9wFpKCaNB+1gnFYMTDliZmBTpLbI3iV3aV26cvJcEr517nmShDGh5QMW+xZtWLkrkZ4TLJzTN4fp3U0l2yZ90kNbcQjGDKI+hIBkzcMHLJuidkbDoAif7k=",
    publicMainKey: {
      crv: "P-256",
      ext: true,
      key_ops: [],
      kty: "EC",
      x: "nwGwyL6D7-mpGv3ahjdgFz7-FxEFSZZqWio5TvGEHWc",
      y: "ubcX2RHk7odTGx6g7dgJpkhEBjzJ8YQ5q0wqtQc9Umc",
    },
    devices: [
      {
        deviceId: "ea87fc9d-c670-4809-8536-4e379e54d6c0",
        encryptedPrivateDeviceKey:
          "72nn+8xeZPSKiSnCjamq0gawEIc6xeaN/q4TFkLGmMrzZbVK72PUwLJGGPq6l8h3amCHDDOdv+ZTQXyBoRiSkLWUpB4hiXOj66KJO2ZlC+vDDfvbscRXhhisLDrZGlG0Xo9BW5W6pFj7vkJvaoOVFCfL0fIILwKwkbt6S1mAC9E3TqVf/1rb2uuFYBViSLZG3jf/j/zT25Yy1VT/c82pMjfEEIQ22VpShVA90JNt2MH56Q3G9xSLpWxVOT1hJqk/4e/G6IGFuVSHbbA5GytpcfSlysyvbjGsgNzV4LDoKFCltQmD4H4bD49sCKpo4CAwZlr3eR9jziWY24Oa7Zg0",
      },
    ],
    documents: [],
  },
};
