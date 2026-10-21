import {
  handleChatError,
  updateGroupSubtitle
} from "../../_shared/doctor-chat.js";

export const onRequestPut = async (context) => {
  try {
    return await updateGroupSubtitle(context);
  } catch (error) {
    return handleChatError(error);
  }
};
