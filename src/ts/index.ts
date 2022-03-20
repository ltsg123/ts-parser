import TsPacketHeader from "./head/ts_head";
import PatSection from "./pat";
import PatMapArray from "./pat/pat_map_array";
import PmtSection from "./pmt";
import PmtStreamArray from "./pmt/pmt_stream_array";
import { MAX_PROGRAM_NUM, MAX_STREAM_NUM, TDemux } from "./TDemux/types";
import TsPacket from "./ts_packet";

function handle_ts_pack (handle: TDemux, data: Uint8Array) {
  const tsPacket = new TsPacket(data);
  const pid = tsPacket.ts_header.head.pid;

  // 如果是PAT表，则更新handle
  // 不支持过长的PAT或PMT表
  if (pid == 0) {
    const payload_offset = get_ts_payload_offset(tsPacket.ts_header) + 1;
    const payload = data.subarray(payload_offset);
    const payload_len = 188 - payload_offset;
    if (payload_len >= PatSection.size) {
      const pat = new PatSection(payload);
      const section_len = pat.section_length;
      if (payload_len >= section_len + 3) {
        let pnum = (payload_len - 4 - PatSection.size) / PatMapArray.size;
        const maps = payload.subarray(PatSection.size);

        if (pnum > MAX_PROGRAM_NUM) {
          pnum = MAX_PROGRAM_NUM;
        }
        handle.info.program_num = pnum;
        for (let i = 0; i < pnum; i++) {
          // 最多支持MAX_PROGRAM_NUM张PMT表
          if (i >= MAX_PROGRAM_NUM)
            break;

          handle.info.prog[i].pmt_pid = (new PatMapArray(maps.subarray(PatMapArray.size * i, PatMapArray.size * (i + 1)))).program_map_PID;
        }
      }
    }

    return 0;
  }

  // 查找是否是某个节目的PMT表
  for (let i = 0; i < handle.info.program_num; i++) {
    if (pid == handle.info.prog[i].pmt_pid) {
      const payload_offset = get_ts_payload_offset(tsPacket.ts_header) + 1;
      const payload = data.subarray(payload_offset);
      const payload_len = 188 - payload_offset;
      if (payload_len >= PmtSection.size) {
        const pmt = new PmtSection(payload);
        const section_len = pmt.section_length;
        if (payload_len >= section_len + 3) {
          let program_info_length = pmt.program_info_length;
          let stm = new PmtStreamArray(payload.subarray(PmtSection.size + program_info_length));
          let sn;
          for (sn = 0; sn < MAX_STREAM_NUM; sn++) {
            if (stm.length + 4 >= payload.length + 3 + section_len) {
              break;
            }
            handle.info.prog[i].stream[sn].es_pid = stm.elementary_PID;
            handle.info.prog[i].stream[sn].type = stm.stream_type;

            stm = new PmtStreamArray(stm.data.subarray(PmtStreamArray.size + stm.ES_info_length));
          }
          handle.info.prog[i].stream_num = sn;
        }
      }

      return 0;
    }
  }

  // 查找是否是某个节目的某条流
  for (let i = 0; i < handle.info.program_num; i++) {
    let sn;
    for (sn = 0; sn < handle.info.prog[i].stream_num; sn++) {
      if (pid == handle.info.prog[i].stream[sn].es_pid) {
        handle.program_no = i;
        handle.stream_no = sn;
        // get_ts_pcr(ts_pack, & handle.pts);
        handle.is_pes = 1;
        // get_ts_es(handle, ts_pack);
        return 0;
      }
    }
  }

  // 未找到
  return 0;
}

function get_ts_payload_offset (ts_header: TsPacketHeader) {
  const adaptation_field_control = ts_header.head.adaptation_field_control;
  let payload_offset;

  if (adaptation_field_control == 0)
    payload_offset = 188;
  else if (adaptation_field_control == 1)
    payload_offset = 4;
  else if (adaptation_field_control == 2)
    payload_offset = 188;
  else {
    payload_offset = 5 + ts_header.adaptation_field_length;
    if (payload_offset > 188)
      payload_offset = 188;
    else if (payload_offset < 5)
      payload_offset = 5;
  }

  return payload_offset;
}