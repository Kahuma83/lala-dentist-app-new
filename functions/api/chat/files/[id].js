import {
  downloadAttachment,
  handleChatError
} from "../../../_shared/doctor-chat.js";

export const onRequestGet = async (context) => {
  try {
    return await downloadAttachment(context);
  } catch (error) {
    return handleChatError(error);
  }
};
