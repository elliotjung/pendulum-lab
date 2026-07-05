/**
 * Generic workgroup pipeline for planar N-chain tangent dynamics.
 *
 * The nonlinear reference trajectory and its Jacobian tape are generated in
 * f64 on the CPU. WebGPU consumes that tape and performs the expensive dense
 * tangent-matrix propagation, QR tape, Ginelli backward solve, and finite-time
 * singular-value estimate. The fixed 16-dimensional ceiling covers chains up
 * to N=8 while keeping workgroup storage portable across WebGPU adapters.
 */
export const WGSL_NCHAIN_VARIATIONAL_KERNEL = /* wgsl */ `
struct Params {
  dim: f32, renormEvery: f32, forwardTransient: f32, window: f32,
  backwardTransient: f32, dt: f32, jacOffset: f32, framesOffset: f32,
  rOffset: f32, outputVectorsOffset: f32, pad0: f32, pad1: f32,
  pad2: f32, pad3: f32, pad4: f32, pad5: f32,
};

@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;

var<workgroup> frame: array<f32, 256>;
var<workgroup> stm: array<f32, 256>;
var<workgroup> firstProduct: array<f32, 256>;
var<workgroup> secondProduct: array<f32, 256>;
var<workgroup> stmFirst: array<f32, 256>;
var<workgroup> stmSecond: array<f32, 256>;

fn qrFrame(dim: u32, destination: u32, writeFactor: bool) {
  if (writeFactor) {
    for (var i = 0u; i < dim * dim; i = i + 1u) {
      data[destination + i] = 0.0;
    }
  }
  for (var col = 0u; col < dim; col = col + 1u) {
    for (var prev = 0u; prev < col; prev = prev + 1u) {
      var dot = 0.0;
      for (var row = 0u; row < dim; row = row + 1u) {
        dot = dot + frame[row * dim + col] * frame[row * dim + prev];
      }
      if (writeFactor) {
        data[destination + prev * dim + col] = dot;
      }
      for (var row = 0u; row < dim; row = row + 1u) {
        frame[row * dim + col] = frame[row * dim + col] - dot * frame[row * dim + prev];
      }
    }
    var normSquared = 0.0;
    for (var row = 0u; row < dim; row = row + 1u) {
      let value = frame[row * dim + col];
      normSquared = normSquared + value * value;
    }
    let norm = sqrt(max(normSquared, 0.0));
    if (writeFactor) {
      data[destination + col * dim + col] = norm;
    }
    let inverse = select(0.0, 1.0 / norm, norm > 1e-20);
    for (var row = 0u; row < dim; row = row + 1u) {
      frame[row * dim + col] = frame[row * dim + col] * inverse;
    }
  }
}

fn storeFrame(dim: u32, destination: u32) {
  for (var i = 0u; i < dim * dim; i = i + 1u) {
    data[destination + i] = frame[i];
  }
}

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) localId: vec3<u32>, @builtin(workgroup_id) groupId: vec3<u32>) {
  if (groupId.x != 0u) { return; }
  let local = localId.x;
  let dim = u32(params.dim);
  let matrixSize = dim * dim;
  if (dim < 2u || dim > 16u || u32(params.window) == 0u || u32(params.renormEvery) == 0u || u32(params.backwardTransient) >= u32(params.window)) {
    if (local == 0u) { data[0] = -1.0; }
    return;
  }

  if (local < matrixSize) {
    let row = local / dim;
    let col = local % dim;
    let identity = select(0.0, 1.0, row == col);
    frame[local] = identity;
    stm[local] = identity;
  }
  workgroupBarrier();

  let totalIntervals = u32(params.forwardTransient) + u32(params.window);
  let totalSteps = totalIntervals * u32(params.renormEvery);
  for (var step = 0u; step < totalSteps; step = step + 1u) {
    let jacobian = u32(params.jacOffset) + step * matrixSize;
    if (local < matrixSize) {
      let row = local / dim;
      let col = local % dim;
      var frameValue = 0.0;
      var stmValue = 0.0;
      for (var inner = 0u; inner < dim; inner = inner + 1u) {
        let j = data[jacobian + row * dim + inner];
        frameValue = frameValue + j * frame[inner * dim + col];
        stmValue = stmValue + j * stm[inner * dim + col];
      }
      firstProduct[local] = frameValue;
      stmFirst[local] = stmValue;
    }
    workgroupBarrier();
    if (local < matrixSize) {
      let row = local / dim;
      let col = local % dim;
      var frameValue = 0.0;
      var stmValue = 0.0;
      for (var inner = 0u; inner < dim; inner = inner + 1u) {
        let j = data[jacobian + row * dim + inner];
        frameValue = frameValue + j * firstProduct[inner * dim + col];
        stmValue = stmValue + j * stmFirst[inner * dim + col];
      }
      secondProduct[local] = frameValue;
      stmSecond[local] = stmValue;
    }
    workgroupBarrier();
    if (local < matrixSize) {
      let halfDtSquared = 0.5 * params.dt * params.dt;
      frame[local] = frame[local] + params.dt * firstProduct[local] + halfDtSquared * secondProduct[local];
      stm[local] = stm[local] + params.dt * stmFirst[local] + halfDtSquared * stmSecond[local];
    }
    workgroupBarrier();

    if ((step + 1u) % u32(params.renormEvery) == 0u) {
      let interval = (step + 1u) / u32(params.renormEvery);
      if (local == 0u) {
        if (interval <= u32(params.forwardTransient)) {
          qrFrame(dim, 0u, false);
          if (interval == u32(params.forwardTransient)) {
            for (var i = 0u; i < matrixSize; i = i + 1u) { stm[i] = select(0.0, 1.0, (i / dim) == (i % dim)); }
            storeFrame(dim, u32(params.framesOffset));
          }
        } else {
          let windowIndex = interval - u32(params.forwardTransient) - 1u;
          let factorDestination = u32(params.rOffset) + windowIndex * matrixSize;
          qrFrame(dim, factorDestination, true);
          storeFrame(dim, u32(params.framesOffset) + (windowIndex + 1u) * matrixSize);
          for (var col = 0u; col < dim; col = col + 1u) {
            data[8u + col] = data[8u + col] + log(max(data[factorDestination + col * dim + col], 1e-20));
          }
        }
      }
      workgroupBarrier();
    }
  }

  if (local == 0u) {
    let window = u32(params.window);
    let intervalTime = f32(u32(params.renormEvery)) * params.dt;
    let totalTime = f32(window) * intervalTime;
    var exponents: array<f32, 16>;
    var maxAbsExponent = 0.0;
    for (var i = 0u; i < dim; i = i + 1u) {
      exponents[i] = data[8u + i] / totalTime;
      data[8u + i] = exponents[i];
      maxAbsExponent = max(maxAbsExponent, abs(exponents[i]));
    }

    var coeffs: array<f32, 256>;
    var solved: array<f32, 256>;
    var vectors: array<f32, 256>;
    for (var i = 0u; i < matrixSize; i = i + 1u) {
      coeffs[i] = select(0.0, 1.0, (i / dim) == (i % dim));
    }
    var angleSum = 0.0;
    var angleMin = 1.57079632679;
    var angleCount = 0.0;
    let zeroTolerance = 1e-6 + 0.05 * maxAbsExponent;
    let analysisMax = window - u32(params.backwardTransient);
    var backwards = i32(window) - 1i;
    loop {
      if (backwards < 0i) { break; }
      let index = u32(backwards);
      let factor = u32(params.rOffset) + index * matrixSize;
      for (var i = 0u; i < matrixSize; i = i + 1u) { solved[i] = 0.0; }
      for (var col = 0u; col < dim; col = col + 1u) {
        var row = i32(dim) - 1i;
        loop {
          var value = coeffs[u32(row) * dim + col];
          for (var inner = u32(row + 1i); inner < dim; inner = inner + 1u) {
            value = value - data[factor + u32(row) * dim + inner] * solved[inner * dim + col];
          }
          let diagonal = data[factor + u32(row) * dim + u32(row)];
          solved[u32(row) * dim + col] = select(0.0, value / diagonal, abs(diagonal) > 1e-20);
          if (row == 0i) { break; }
          row = row - 1i;
        }
        var normSquared = 0.0;
        for (var r = 0u; r < dim; r = r + 1u) { normSquared = normSquared + solved[r * dim + col] * solved[r * dim + col]; }
        let inverse = select(0.0, inverseSqrt(normSquared), normSquared > 0.0);
        for (var r = 0u; r < dim; r = r + 1u) { coeffs[r * dim + col] = solved[r * dim + col] * inverse; }
      }
      if (index <= analysisMax) {
        let qFrame = u32(params.framesOffset) + index * matrixSize;
        for (var row = 0u; row < dim; row = row + 1u) {
          for (var col = 0u; col < dim; col = col + 1u) {
            var value = 0.0;
            for (var inner = 0u; inner < dim; inner = inner + 1u) {
              value = value + data[qFrame + row * dim + inner] * coeffs[inner * dim + col];
            }
            vectors[row * dim + col] = value;
          }
        }
        for (var col = 0u; col < dim; col = col + 1u) {
          var normSquared = 0.0;
          for (var row = 0u; row < dim; row = row + 1u) { normSquared = normSquared + vectors[row * dim + col] * vectors[row * dim + col]; }
          let inverse = select(0.0, inverseSqrt(normSquared), normSquared > 0.0);
          for (var row = 0u; row < dim; row = row + 1u) { vectors[row * dim + col] = vectors[row * dim + col] * inverse; }
        }
        if (index == 0u) {
          for (var col = 0u; col < dim; col = col + 1u) {
            for (var row = 0u; row < dim; row = row + 1u) {
              data[u32(params.outputVectorsOffset) + col * dim + row] = vectors[row * dim + col];
            }
          }
        }
        var foundPair = false;
        var localMin = 1.57079632679;
        for (var expanding = 0u; expanding < dim; expanding = expanding + 1u) {
          if (exponents[expanding] <= zeroTolerance) { continue; }
          for (var contracting = 0u; contracting < dim; contracting = contracting + 1u) {
            if (exponents[contracting] >= -zeroTolerance) { continue; }
            var dot = 0.0;
            for (var row = 0u; row < dim; row = row + 1u) {
              dot = dot + vectors[row * dim + expanding] * vectors[row * dim + contracting];
            }
            localMin = min(localMin, acos(clamp(abs(dot), 0.0, 1.0)));
            foundPair = true;
          }
        }
        if (foundPair) {
          angleSum = angleSum + localMin;
          angleMin = min(angleMin, localMin);
          angleCount = angleCount + 1.0;
        }
      }
      backwards = backwards - 1i;
    }

    var cauchyGreen: array<f32, 256>;
    for (var row = 0u; row < dim; row = row + 1u) {
      for (var col = 0u; col < dim; col = col + 1u) {
        var value = 0.0;
        for (var inner = 0u; inner < dim; inner = inner + 1u) { value = value + stm[inner * dim + row] * stm[inner * dim + col]; }
        cauchyGreen[row * dim + col] = value;
      }
    }
    var power: array<f32, 16>;
    var nextPower: array<f32, 16>;
    for (var i = 0u; i < dim; i = i + 1u) { power[i] = 1.0 / sqrt(f32(dim)); }
    for (var iteration = 0u; iteration < 24u; iteration = iteration + 1u) {
      var normSquared = 0.0;
      for (var row = 0u; row < dim; row = row + 1u) {
        var value = 0.0;
        for (var col = 0u; col < dim; col = col + 1u) { value = value + cauchyGreen[row * dim + col] * power[col]; }
        nextPower[row] = value;
        normSquared = normSquared + value * value;
      }
      let inverse = select(0.0, inverseSqrt(normSquared), normSquared > 0.0);
      for (var i = 0u; i < dim; i = i + 1u) { power[i] = nextPower[i] * inverse; }
    }
    var eigenvalue = 0.0;
    for (var row = 0u; row < dim; row = row + 1u) {
      var value = 0.0;
      for (var col = 0u; col < dim; col = col + 1u) { value = value + cauchyGreen[row * dim + col] * power[col]; }
      eigenvalue = eigenvalue + power[row] * value;
    }

    data[0] = 1.0;
    data[1] = f32(dim);
    data[2] = 0.5 * log(max(eigenvalue, 1e-20)) / totalTime;
    data[3] = select(-1.0, angleSum / angleCount, angleCount > 0.0);
    data[4] = select(-1.0, angleMin, angleCount > 0.0);
    data[5] = angleCount;
    data[6] = totalTime;
    data[7] = f32(window);
  }
}
`;

/**
 * Candidate kernel for the next promotion step: nonlinear planar N-chain
 * trajectory integration plus central-difference Jacobian-tape construction.
 *
 * This kernel is deliberately narrower than the downstream STM/QR kernel:
 * it covers N<=3 while the CPU f64 oracle remains authoritative. The caller
 * may use this f32 tape only after comparing trajectory, final state, and
 * Jacobian entries against the CPU f64 tape for the same settings.
 */
export const WGSL_NCHAIN_TRAJECTORY_TAPE_KERNEL = /* wgsl */ `
struct Params {
  m0: f32, m1: f32, m2: f32, l0: f32,
  l1: f32, l2: f32, g: f32, damping: f32,
  links: f32, dim: f32, dt: f32, steps: f32,
  eps: f32, trajectoryOffset: f32, tapeOffset: f32, finalStateOffset: f32,
};

@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;

fn mass(i: u32) -> f32 {
  if (i == 0u) { return params.m0; }
  if (i == 1u) { return params.m1; }
  return params.m2;
}

fn length(i: u32) -> f32 {
  if (i == 0u) { return params.l0; }
  if (i == 1u) { return params.l1; }
  return params.l2;
}

fn suffix(i: u32, links: u32) -> f32 {
  var total = 0.0;
  for (var j = i; j < links; j = j + 1u) {
    total = total + mass(j);
  }
  return total;
}

fn solve_linear(mIn: ptr<function, array<f32, 9>>, bIn: ptr<function, array<f32, 3>>, links: u32) -> bool {
  for (var k = 0u; k < links; k = k + 1u) {
    var pivot = k;
    var pivotAbs = abs((*mIn)[k * 3u + k]);
    for (var row = k + 1u; row < links; row = row + 1u) {
      let candidate = abs((*mIn)[row * 3u + k]);
      if (candidate > pivotAbs) {
        pivotAbs = candidate;
        pivot = row;
      }
    }
    if (pivotAbs < 1e-7) { return false; }
    if (pivot != k) {
      for (var col = k; col < links; col = col + 1u) {
        let tmp = (*mIn)[k * 3u + col];
        (*mIn)[k * 3u + col] = (*mIn)[pivot * 3u + col];
        (*mIn)[pivot * 3u + col] = tmp;
      }
      let rhsTmp = (*bIn)[k];
      (*bIn)[k] = (*bIn)[pivot];
      (*bIn)[pivot] = rhsTmp;
    }
    for (var row = k + 1u; row < links; row = row + 1u) {
      let factor = (*mIn)[row * 3u + k] / (*mIn)[k * 3u + k];
      (*mIn)[row * 3u + k] = 0.0;
      for (var col = k + 1u; col < links; col = col + 1u) {
        (*mIn)[row * 3u + col] = (*mIn)[row * 3u + col] - factor * (*mIn)[k * 3u + col];
      }
      (*bIn)[row] = (*bIn)[row] - factor * (*bIn)[k];
    }
  }
  var row = i32(links) - 1i;
  loop {
    var value = (*bIn)[u32(row)];
    for (var col = u32(row + 1i); col < links; col = col + 1u) {
      value = value - (*mIn)[u32(row) * 3u + col] * (*bIn)[col];
    }
    (*bIn)[u32(row)] = value / (*mIn)[u32(row) * 3u + u32(row)];
    if (row == 0i) { break; }
    row = row - 1i;
  }
  return true;
}

fn rhs_chain(state: array<f32, 6>, links: u32) -> array<f32, 6> {
  var out: array<f32, 6>;
  var matrix: array<f32, 9>;
  var rhs: array<f32, 3>;
  for (var j = 0u; j < links; j = j + 1u) {
    let thetaJ = state[j];
    let omegaJ = state[links + j];
    let lengthJ = length(j);
    out[j] = omegaJ;
    var coupling = 0.0;
    for (var k = 0u; k < links; k = k + 1u) {
      let thetaK = state[k];
      let omegaK = state[links + k];
      let lengthK = length(k);
      let s = suffix(max(j, k), links);
      let delta = thetaJ - thetaK;
      matrix[j * 3u + k] = s * lengthJ * lengthK * cos(delta);
      coupling = coupling + s * lengthJ * lengthK * sin(delta) * omegaK * omegaK;
    }
    rhs[j] = -coupling - params.g * lengthJ * sin(thetaJ) * suffix(j, links) - params.damping * omegaJ;
  }
  if (!solve_linear(&matrix, &rhs, links)) {
    out[0] = 1e30;
    return out;
  }
  for (var j = 0u; j < links; j = j + 1u) {
    out[links + j] = rhs[j];
  }
  return out;
}

fn add_scaled(a: array<f32, 6>, b: array<f32, 6>, scale: f32, dim: u32) -> array<f32, 6> {
  var out: array<f32, 6>;
  for (var i = 0u; i < dim; i = i + 1u) {
    out[i] = a[i] + scale * b[i];
  }
  return out;
}

fn rk4_step(state: array<f32, 6>, links: u32, dim: u32, dt: f32) -> array<f32, 6> {
  let k1 = rhs_chain(state, links);
  let k2 = rhs_chain(add_scaled(state, k1, 0.5 * dt, dim), links);
  let k3 = rhs_chain(add_scaled(state, k2, 0.5 * dt, dim), links);
  let k4 = rhs_chain(add_scaled(state, k3, dt, dim), links);
  var out: array<f32, 6>;
  for (var i = 0u; i < dim; i = i + 1u) {
    out[i] = state[i] + (dt / 6.0) * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
  }
  return out;
}

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x != 0u) { return; }
  let links = u32(params.links);
  let dim = u32(params.dim);
  let steps = u32(params.steps);
  if (links < 1u || links > 3u || dim != links * 2u || params.dt <= 0.0 || steps == 0u || params.eps <= 0.0) {
    data[0] = -1.0;
    return;
  }

  var state: array<f32, 6>;
  for (var i = 0u; i < dim; i = i + 1u) {
    state[i] = data[i];
  }
  let trajectoryOffset = u32(params.trajectoryOffset);
  let tapeOffset = u32(params.tapeOffset);
  let finalStateOffset = u32(params.finalStateOffset);
  let matrixSize = dim * dim;

  for (var step = 0u; step < steps; step = step + 1u) {
    for (var i = 0u; i < dim; i = i + 1u) {
      data[trajectoryOffset + step * dim + i] = state[i];
    }
    for (var col = 0u; col < dim; col = col + 1u) {
      var plus = state;
      var minus = state;
      let delta = params.eps * max(1.0, abs(state[col]));
      plus[col] = plus[col] + delta;
      minus[col] = minus[col] - delta;
      let fp = rhs_chain(plus, links);
      let fm = rhs_chain(minus, links);
      for (var row = 0u; row < dim; row = row + 1u) {
        data[tapeOffset + step * matrixSize + row * dim + col] = (fp[row] - fm[row]) / (2.0 * delta);
      }
    }
    state = rk4_step(state, links, dim, params.dt);
  }
  for (var i = 0u; i < dim; i = i + 1u) {
    data[trajectoryOffset + steps * dim + i] = state[i];
    data[finalStateOffset + i] = state[i];
  }
  data[0] = 1.0;
}
`;
