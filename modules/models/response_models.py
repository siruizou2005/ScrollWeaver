"""
Pydantic models for structured output from Gemini API.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any


class RolePlan(BaseModel):
    """Model for role planning response."""
    action: str = Field(description="Represents the action, expressed as a single verb.")
    interact_type: Literal["role", "environment", "npc", "no"] = Field(
        description="Indicates the interaction target of your action. "
        "'role' for character interaction, 'environment' for environmental interaction, "
        "'npc' for non-character interaction, 'no' for no interaction."
    )
    target_role_codes: List[str] = Field(
        default_factory=list,
        description="List of target character codes if 'interact_type' is 'role'. "
        "For 'single' interaction, this list should have exactly one element."
    )
    target_npc_name: Optional[str] = Field(
        default=None,
        description="Target NPC name if 'interact_type' is 'npc'."
    )
    visible_role_codes: List[str] = Field(
        default_factory=list,
        description="List of role codes that can see this action. Should include 'target_role_codes'."
    )
    detail: str = Field(
        description="A literary narrative statement containing thoughts, speech, and actions. "
        "Must be plain text without Markdown formatting. "
        "Must not mention, speak to, or reference characters not present in the current scene."
    )


class SingleRoleResponse(BaseModel):
    """Model for single role interaction response."""
    if_end_interaction: bool = Field(
        description="Set to true if it's appropriate to end this interaction."
    )
    extra_interact_type: Literal["environment", "npc", "no"] = Field(
        description="'environment' indicates additional environmental interaction needed, "
        "'npc' means additional interaction with non-main character needed, "
        "'no' means no extra interaction needed."
    )
    target_npc_name: Optional[str] = Field(
        default=None,
        description="Target NPC name or job if 'extra_interact_type' is 'npc'."
    )
    detail: str = Field(
        description="A literary narrative-style statement containing thoughts, speech, and actions. "
        "Must be plain text without Markdown formatting. "
        "Must not mention, speak to, or reference characters not present in the current scene."
    )


class MultiRoleResponse(BaseModel):
    """Model for multi-role interaction response."""
    if_end_interaction: bool = Field(
        description="Set to true if it's appropriate to end this interaction."
    )
    extra_interact_type: Literal["environment", "npc", "no"] = Field(
        description="'environment' indicates additional environmental interaction needed, "
        "'npc' means additional interaction with non-main character needed, "
        "'no' means no extra interaction needed."
    )
    target_role_code: Optional[str] = Field(
        default=None,
        description="Target role code if additional interaction is needed."
    )
    target_npc_name: Optional[str] = Field(
        default=None,
        description="Target NPC name if 'extra_interact_type' is 'npc'."
    )
    visible_role_codes: List[str] = Field(
        default_factory=list,
        description="List of role codes that can see this action."
    )
    detail: str = Field(
        description="A literary narrative-style statement containing thoughts, speech, and actions. "
        "Must be plain text without Markdown formatting. "
        "Must not mention, speak to, or reference characters not present in the current scene."
    )


class NPCRoleResponse(BaseModel):
    """Model for NPC interaction response."""
    if_end_interaction: bool = Field(
        description="Set to true if you believe this interaction should conclude."
    )
    detail: str = Field(
        description="A literary and narrative description that includes thoughts, speech, and actions. "
        "Must be plain text without Markdown formatting."
    )


class UpdateGoal(BaseModel):
    """Model for goal update response."""
    if_change_goal: bool = Field(
        description="Set to true if the goal is realized and needs to be updated."
    )
    updated_goal: Optional[str] = Field(
        default=None,
        description="Updated goal if 'if_change_goal' is set to true."
    )


class UpdateStatus(BaseModel):
    """Model for status update response."""
    updated_status: str = Field(description="Updated status description.")
    activity: float = Field(description="Activity level as a float value.")


class MoveResponse(BaseModel):
    """Model for movement response."""
    if_move: bool = Field(description="Set to true if the character should move.")
    destination_code: Optional[str] = Field(
        default=None,
        description="Destination location code if 'if_move' is true."
    )
    detail: str = Field(
        description="A literary narrative statement describing the movement or reason for not moving."
    )


class JudgeIfEnded(BaseModel):
    """Model for judging if story ended."""
    if_end: bool = Field(description="Set to true if the story should end.")
    detail: str = Field(description="Explanation for the decision.")


class ScriptInstruction(BaseModel):
    """Model for script instruction response."""
    progress: str = Field(description="Judgment on the overall progress.")
    # Use model_config to allow extra fields for dynamic role_code keys
    model_config = {"extra": "allow"}


class SceneActors(BaseModel):
    """Model for scene actors selection response."""
    role_codes: List[str] = Field(description="List of selected role codes for the scene.")


class EventText(BaseModel):
    """Model for event generation/update response."""
    event: str = Field(
        description="A concise event description. Should be novel, interesting, and contain conflicts between different characters. "
        "Must not include any details, specific character actions, psychology, or dialogue. "
        "Must be plain text without Markdown formatting."
    )


class MotivationText(BaseModel):
    """Model for motivation setting response."""
    motivation: str = Field(
        description="A long-term goal/motivation related to the character's identity and background. "
        "It should be an ultimate objective that guides the character's actions. "
        "Must be plain text without Markdown formatting."
    )


class StoryText(BaseModel):
    """Model for story generation from logs."""
    story: str = Field(
        description="A literary narrative expanded from action logs in third-person omniscient perspective. "
        "Can rearrange narrative order for dramatic effect. "
        "Can modify character action descriptions while preserving key information. "
        "Should add necessary scene descriptions, plot connections, and atmosphere. "
        "CRITICAL: Must convert all format markers to natural narrative text: "
        "- 【】inner thoughts → third-person narrative (e.g., '【he felt uneasy】' → 'he felt uneasy' or 'a sense of unease washed over him') "
        "- () actions → natural narrative (e.g., '(he stood up)' → 'he stood up' or 'he rose to his feet') "
        "- 「」speech → quotation marks (e.g., '「hello」' → '\"hello\"' or 'he said: \"hello\"') "
        "- ALL markers (【】、()、「」) MUST be completely removed, output pure narrative text "
        "Must be plain text without Markdown formatting or any special markers. "
        "Output should read like a traditional novel, flowing and natural."
    )


class ScriptText(BaseModel):
    """Model for script generation response."""
    script: str = Field(
        description="A script description for the scene. "
        "Should be vivid, visual, and match the worldview style. "
        "Only describe the current situation, do not make actions for characters. "
        "Must be plain text without Markdown formatting."
    )
