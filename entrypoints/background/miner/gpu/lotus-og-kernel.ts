// Ported from lotus-gpu-miner/kernels/lotus_og.cl (behavior mirrored)
// Embedded as a TS string so the background runtime can create GPUShaderModule directly.

export const LOTUS_OG_WGSL = /* wgsl */ `
alias num_t = u32;

override ITERATIONS: u32 = 1u;

const FOUND: u32 = 0u;
const NONCE_OUT: u32 = 1u;

const H: array<u32, 8> = array<u32, 8>(
    0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au,
    0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u
);

const K: array<u32, 64> = array<u32, 64>(
    0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u, 0x3956c25bu, 0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u,
    0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u, 0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u,
    0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu, 0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
    0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u, 0xc6e00bf3u, 0xd5a79147u, 0x06ca6351u, 0x14292967u,
    0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u, 0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
    0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u, 0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
    0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u, 0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu, 0x682e6ff3u,
    0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u, 0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u
);

const POW_LAYER_PAD: array<u32, 3> = array<u32, 3>(
    0x80000000u, 0x00000000u, 0x000001a0u
);

const CHAIN_LAYER_SCHEDULE_ARRAY: array<u32, 64> = array<u32, 64>(
    0x80000000u, 0x00000000u, 0x00000000u, 0x00000000u, 0x00000000u, 0x00000000u, 0x00000000u, 0x00000000u,
    0x00000000u, 0x00000000u, 0x00000000u, 0x00000000u, 0x00000000u, 0x00000000u, 0x00000000u, 0x00000200u,
    0x80000000u, 0x01400000u, 0x00205000u, 0x00005088u, 0x22000800u, 0x22550014u, 0x05089742u, 0xa0000020u,
    0x5a880000u, 0x005c9400u, 0x0016d49du, 0xfa801f00u, 0xd33225d0u, 0x11675959u, 0xf6e6bfdau, 0xb30c1549u,
    0x08b2b050u, 0x9d7c4c27u, 0x0ce2a393u, 0x88e6e1eau, 0xa52b4335u, 0x67a16f49u, 0xd732016fu, 0x4eeb2e91u,
    0x5dbf55e5u, 0x8eee2335u, 0xe2bc5ec2u, 0xa83f4394u, 0x45ad78f7u, 0x36f3d0cdu, 0xd99c05e8u, 0xb0511dc7u,
    0x69bc7ac4u, 0xbd11375bu, 0xe3ba71e5u, 0x3b209ff2u, 0x18feee17u, 0xe25ad9e7u, 0x13375046u, 0x0515089du,
    0x4f0d0f04u, 0x2627484eu, 0x310128d2u, 0xc668b434u, 0x420841ccu, 0x62d311b8u, 0xe59ba771u, 0x85a7a484u
);

struct Params {
    offset: u32,
    target0: u32,
    target1: u32,
    target2: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> partial_header: array<u32>;
@group(0) @binding(2) var<storage, read_write> output: array<u32>;

fn rotr(x: num_t, n: num_t) -> num_t {
    return (x >> n) | (x << (32u - n));
}

fn sigma0(a: num_t) -> num_t {
    return rotr(a, 2u) ^ rotr(a, 13u) ^ rotr(a, 22u);
}

fn sigma1(e: num_t) -> num_t {
    return rotr(e, 6u) ^ rotr(e, 11u) ^ rotr(e, 25u);
}

fn choose(e: num_t, f: num_t, g: num_t) -> num_t {
    return (e & f) ^ ((~e) & g);
}

fn majority(a: num_t, b: num_t, c: num_t) -> num_t {
    return (a & b) ^ (a & c) ^ (b & c);
}

fn sha256_extend(schedule_array: ptr<function, array<u32, 64>>) {
    var i: u32 = 16u;
    loop {
        if (i >= 64u) { break; }
        let s0 = rotr((*schedule_array)[i - 15u], 7u) ^ rotr((*schedule_array)[i - 15u], 18u) ^ ((*schedule_array)[i - 15u] >> 3u);
        let s1 = rotr((*schedule_array)[i - 2u], 17u) ^ rotr((*schedule_array)[i - 2u], 19u) ^ ((*schedule_array)[i - 2u] >> 10u);
        (*schedule_array)[i] = (*schedule_array)[i - 16u] + s0 + (*schedule_array)[i - 7u] + s1;
        i = i + 1u;
    }
}

fn sha256_compress(schedule_array: ptr<function, array<u32, 64>>, hash: ptr<function, array<u32, 8>>) {
    var a = (*hash)[0];
    var b = (*hash)[1];
    var c = (*hash)[2];
    var d = (*hash)[3];
    var e = (*hash)[4];
    var f = (*hash)[5];
    var g = (*hash)[6];
    var h = (*hash)[7];

    var i: u32 = 0u;
    loop {
        if (i >= 64u) { break; }
        let tmp1 = h + sigma1(e) + choose(e, f, g) + K[i] + (*schedule_array)[i];
        let tmp2 = sigma0(a) + majority(a, b, c);

        h = g;
        g = f;
        f = e;
        e = d + tmp1;
        d = c;
        c = b;
        b = a;
        a = tmp1 + tmp2;

        i = i + 1u;
    }

    (*hash)[0] = (*hash)[0] + a;
    (*hash)[1] = (*hash)[1] + b;
    (*hash)[2] = (*hash)[2] + c;
    (*hash)[3] = (*hash)[3] + d;
    (*hash)[4] = (*hash)[4] + e;
    (*hash)[5] = (*hash)[5] + f;
    (*hash)[6] = (*hash)[6] + g;
    (*hash)[7] = (*hash)[7] + h;
}

fn sha256_compress_chain_const(hash: ptr<function, array<u32, 8>>) {
    var a = (*hash)[0];
    var b = (*hash)[1];
    var c = (*hash)[2];
    var d = (*hash)[3];
    var e = (*hash)[4];
    var f = (*hash)[5];
    var g = (*hash)[6];
    var h = (*hash)[7];

    var i: u32 = 0u;
    loop {
        if (i >= 64u) { break; }
        let tmp1 = h + sigma1(e) + choose(e, f, g) + K[i] + CHAIN_LAYER_SCHEDULE_ARRAY[i];
        let tmp2 = sigma0(a) + majority(a, b, c);

        h = g;
        g = f;
        f = e;
        e = d + tmp1;
        d = c;
        c = b;
        b = a;
        a = tmp1 + tmp2;

        i = i + 1u;
    }

    (*hash)[0] = (*hash)[0] + a;
    (*hash)[1] = (*hash)[1] + b;
    (*hash)[2] = (*hash)[2] + c;
    (*hash)[3] = (*hash)[3] + d;
    (*hash)[4] = (*hash)[4] + e;
    (*hash)[5] = (*hash)[5] + f;
    (*hash)[6] = (*hash)[6] + g;
    (*hash)[7] = (*hash)[7] + h;
}

fn sha256_pow_layer(schedule_array: ptr<function, array<u32, 64>>, hash: ptr<function, array<u32, 8>>) {
    var i: u32 = 0u;
    loop {
        if (i >= 8u) { break; }
        (*hash)[i] = H[i];
        i = i + 1u;
    }
    sha256_extend(schedule_array);
    sha256_compress(schedule_array, hash);
}

fn sha256_chain_layer(schedule_array: ptr<function, array<u32, 64>>, hash: ptr<function, array<u32, 8>>) {
    var i: u32 = 0u;
    loop {
        if (i >= 8u) { break; }
        (*hash)[i] = H[i];
        i = i + 1u;
    }
    sha256_extend(schedule_array);
    sha256_compress(schedule_array, hash);

    sha256_compress_chain_const(hash);
}

fn hash_below_target(hash: ptr<function, array<u32, 8>>) -> bool {
    // Match lotus_og.cl pre-filter exactly.
    // Full target comparison is done on CPU before submit.
    _ = params.target0;
    _ = params.target1;
    _ = params.target2;
    return (*hash)[7] == 0u;
}

@compute @workgroup_size(256)
fn search(@builtin(global_invocation_id) gid: vec3<u32>) {
    var pow_layer: array<u32, 64>;
    var chain_layer: array<u32, 64>;
    var hash: array<u32, 8>;
    var pow_hash: array<u32, 8>;

    var i: u32 = 0u;
    loop {
        if (i >= 8u) { break; }
        chain_layer[i] = partial_header[i];
        i = i + 1u;
    }

    i = 0u;
    loop {
        if (i >= 13u) { break; }
        pow_layer[i] = partial_header[i + 8u];
        i = i + 1u;
    }

    i = 0u;
    loop {
        if (i >= 3u) { break; }
        pow_layer[i + 13u] = POW_LAYER_PAD[i];
        i = i + 1u;
    }

    var iteration: u32 = 0u;
    loop {
        if (iteration >= ITERATIONS) { break; }

        let nonce = params.offset + gid.x * ITERATIONS + iteration;
        pow_layer[3] = nonce;

        sha256_pow_layer(&pow_layer, &pow_hash);

        i = 0u;
        loop {
            if (i >= 8u) { break; }
            chain_layer[8u + i] = pow_hash[i];
            i = i + 1u;
        }

        sha256_chain_layer(&chain_layer, &hash);

        if (hash_below_target(&hash)) {
            output[FOUND] = 1u;
            output[NONCE_OUT] = nonce;
        }

        iteration = iteration + 1u;
    }
}
`
