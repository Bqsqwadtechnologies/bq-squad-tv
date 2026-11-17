# Delivery measurements

**Simulation only — not live production measurements.** This document records deterministic in-process model outputs. It is not a capacity estimate and must not be used to promise a viewer count.

The harness is `src/lib/server/streaming/delivery-simulation.ts`, with assertions in `delivery-simulation.test.ts`. It models a fake storage adapter, shared 30-minute playlist windows, direct signed segment URLs, periodic heartbeats, 300-second settlement blocks and replica failover events.

The 1,000-viewer, 10-minute test models 150,000 segment requests and asserts zero API reads on the segment path, one shared playlist generation, and 2,000 settlement transactions (two per simulated viewer). The 1-hour failover test models two playlist windows, six bounded signing calls and ten simulated failovers.

These counters are model assumptions, not measurements from Firebase, Modal, Backblaze, Lovable storage, Android devices or real network traffic. The simulation deliberately does not publish a capacity number.
